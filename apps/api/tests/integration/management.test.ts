import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import app from "../../src/app.ts";
import { getDatabase } from "../../src/db/client.ts";
import {
  authAttempts,
  bankAccounts,
  customerProfiles,
  managementEvents,
  users,
} from "../../src/db/schema.ts";
import { assertFinancialAccountEligible } from "../../src/modules/accounts/eligibility.ts";
import { authDigest } from "../../src/modules/auth/auth-config.ts";
import { hashCredential } from "../../src/modules/auth/credentials.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

const origin = "http://localhost:3000";
const password = "Isolated management fixture";
const run = randomUUID();
const people = ["admin", "staff", "owner", "neighbor"] as const;
type Person = (typeof people)[number];
const address = (person: Person) => `${person}-${run}@bankbolt.example`;
const identities = new Map<Person, string>();
const customers = new Map<Person, string>();
const cookies = new Map<Person, string>();
const accounts: string[] = [];
let database: ReturnType<typeof getDatabase> | undefined;
const prefix = "/api/v1/management";

function required(map: Map<Person, string>, key: Person) {
  const value = map.get(key);
  if (!value) throw new Error(`Missing fixture for ${key}`);
  return value;
}

function login(person: Person) {
  return request(app)
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .send({ email: address(person), password });
}

async function loginCookie(person: Person) {
  const response = await login(person).expect(200);
  const value: unknown = response.headers["set-cookie"]?.[0];
  if (typeof value !== "string")
    throw new Error("Expected an authenticated cookie.");
  return value.split(";")[0];
}

function get(person: Person, path: string) {
  return request(app).get(path).set("Cookie", required(cookies, person));
}

function patch(person: Person, path: string, body: object) {
  return request(app)
    .patch(prefix + path)
    .set("Origin", origin)
    .set("Cookie", required(cookies, person))
    .send(body);
}

beforeAll(async () => {
  if (existsSync(".env.test")) loadEnvFile(".env.test");
  vi.stubEnv(
    "DATABASE_URL",
    isolatedDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.TEST_DB_PORT,
    ),
  );
  vi.stubEnv("SESSION_SECRET", randomUUID() + randomUUID());
  vi.stubEnv("WEB_ORIGIN", origin);
  vi.stubEnv("VERCEL", "");
  database = getDatabase();
  await migrate(database, { migrationsFolder: "./drizzle" });
  const hash = await hashCredential(password);
  for (const person of people) {
    const role =
      person === "admin" ? "ADMIN" : person === "staff" ? "STAFF" : "CUSTOMER";
    const [user] = await database
      .insert(users)
      .values({
        role,
        email: address(person),
        fullName: `Fictional ${person}`,
        passwordHash: hash,
      })
      .returning({ id: users.id });
    identities.set(person, user.id);
    if (role === "CUSTOMER") {
      const [customer] = await database
        .insert(customerProfiles)
        .values({
          userId: user.id,
          identityReference: randomUUID(),
          dateOfBirth: "1995-01-02",
          address: "Fictional Dhaka address",
          phone: "+1-202-555-0112",
          verificationStatus: "VERIFIED",
        })
        .returning({ id: customerProfiles.id });
      customers.set(person, customer.id);
      const [account] = await database
        .insert(bankAccounts)
        .values({
          type: "BUSINESS",
          status: "ACTIVE",
          balancePoisha: 1000n,
          customerId: customer.id,
          creationKey: randomUUID(),
        })
        .returning({ id: bankAccounts.id });
      accounts.push(account.id);
    }
    cookies.set(person, await loginCookie(person));
  }
});

afterAll(async () => {
  try {
    if (database) {
      await database
        .delete(managementEvents)
        .where(inArray(managementEvents.customerId, [...customers.values()]));
      await database
        .delete(bankAccounts)
        .where(inArray(bankAccounts.id, accounts));
      await database
        .delete(customerProfiles)
        .where(inArray(customerProfiles.id, [...customers.values()]));
      await database.delete(authAttempts).where(
        inArray(
          authAttempts.subject,
          people.map((person) => authDigest("login", address(person))),
        ),
      );
      await database
        .delete(users)
        .where(inArray(users.id, [...identities.values()]));
    }
  } finally {
    await database?.$client.end();
    vi.unstubAllEnvs();
  }
});

it("searches and filters records with server role checks", async () => {
  const search = (person: Person, path: string, body: object) =>
    request(app)
      .post(prefix + path)
      .set("Origin", origin)
      .set("Cookie", required(cookies, person))
      .send(body);
  const result = await search("staff", "/customers/search", {
    q: address("owner"),
    verification: "VERIFIED",
  }).expect(200);
  expect(result.body.customers).toMatchObject([
    { id: required(customers, "owner"), accessStatus: "ACTIVE" },
  ]);
  await search("admin", "/customers/search", {
    q: address("owner"),
    accessStatus: "BLOCKED",
  }).expect(200, { customers: [], hasNextPage: false });
  const found = await search("admin", "/accounts/search", {
    q: address("owner"),
    type: "BUSINESS",
    status: "ACTIVE",
  }).expect(200);
  expect(found.body.accounts).toMatchObject([{ id: accounts[0] }]);
  await search("owner", "/accounts/search", {}).expect(403);
  await get("staff", `${prefix}/accounts/${accounts[0]}`).expect(200);
});

it("scopes customer reads to their own records and rejects balance, metadata and owner changes", async () => {
  const list = await get("owner", "/api/v1/accounts")
    .expect(200)
    .expect("Cache-Control", "no-store");
  expect(list.body.accounts).toMatchObject([
    { id: accounts[0], balancePoisha: "1000", restriction: null },
  ]);
  await get("owner", `/api/v1/accounts/${accounts[1]}`).expect(404);
  await get(
    "owner",
    `${prefix}/customers/${required(customers, "neighbor")}`,
  ).expect(403);
  await patch("owner", `/accounts/${accounts[0]}`, { kind: "limits" }).expect(
    403,
  );
  await request(app)
    .post(`/api/v1/customers/${required(customers, "owner")}/accounts`)
    .set("Cookie", required(cookies, "owner"))
    .set("Origin", origin)
    .send({ type: "SAVINGS", requestId: randomUUID() })
    .expect(403);
  await patch("admin", `/accounts/${accounts[0]}`, {
    kind: "metadata",
    balancePoisha: "0",
    customerId: required(customers, "neighbor"),
  }).expect(400);
});

it("keeps frozen and deactivated accounts readable while preventing financial changes", async () => {
  const path = `/accounts/${accounts[0]}`;
  const change = (action: string) =>
    patch("admin", path, {
      kind: "status",
      action,
      reason: "Fictional review",
    });
  const balanceWrite = () =>
    getDatabase().transaction(async (tx) => {
      const [row] = await tx
        .select({
          status: bankAccounts.status,
          blocked: users.blocked,
          accessActive: users.accessActive,
        })
        .from(bankAccounts)
        .innerJoin(
          customerProfiles,
          eq(customerProfiles.id, bankAccounts.customerId),
        )
        .innerJoin(users, eq(users.id, customerProfiles.userId))
        .where(eq(bankAccounts.id, accounts[0]))
        .for("update");
      assertFinancialAccountEligible(row);
      await tx
        .update(bankAccounts)
        .set({ balancePoisha: sql`${bankAccounts.balancePoisha} + 1` })
        .where(eq(bankAccounts.id, accounts[0]));
    });
  await patch("staff", path, {
    kind: "status",
    action: "FREEZE",
    reason: "Fictional review",
  }).expect(403);
  for (const [action, state, restore] of [
    ["FREEZE", "FROZEN", "UNFREEZE"],
    ["DEACTIVATE", "DEACTIVATED", "REACTIVATE"],
  ] as const) {
    await change(action).expect(204);
    const readable = await get(
      "owner",
      `/api/v1/accounts/${accounts[0]}`,
    ).expect(200);
    expect(readable.body.account).toMatchObject({
      status: state,
      restriction: expect.any(String),
      balancePoisha: "1000",
    });
    await expect(balanceWrite()).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
    });
    const unchanged = await get(
      "owner",
      `/api/v1/accounts/${accounts[0]}`,
    ).expect(200);
    expect(unchanged.body.account.balancePoisha).toBe("1000");
    await change(restore).expect(204);
  }
});

it("updates only allowed account fields, parses limits safely, and records account history", async () => {
  const path = `/accounts/${accounts[0]}`;
  const limits = {
    kind: "limits",
    transferLimitPoisha: "9007199254740993",
    dailyTransferLimitPoisha: "9007199254740994",
    reason: "Fictional limit review",
  };
  await patch("staff", path, limits).expect(403);
  await patch("admin", path, {
    ...limits,
    transferLimitPoisha: "9223372036854775808",
  }).expect(400);
  await patch("admin", path, { ...limits, transferLimitPoisha: "1.20" }).expect(
    400,
  );
  await patch("admin", path, limits).expect(204);
  await patch("admin", path, limits).expect(204);
  await patch("admin", path, {
    kind: "metadata",
    businessName: "Fictional Studio",
    businessRegistrationReference: "SIM-STUDIO",
    reason: "Fictional identity update",
  }).expect(204);
  const detail = await get("admin", prefix + path).expect(200);
  expect(detail.body.account).toMatchObject({
    businessName: "Fictional Studio",
    transferLimitPoisha: limits.transferLimitPoisha,
    dailyTransferLimitPoisha: limits.dailyTransferLimitPoisha,
    balancePoisha: "1000",
  });
  expect(
    detail.body.history.events.filter(
      (event: { action: string }) => event.action === "ACCOUNT_LIMITS_UPDATED",
    ),
  ).toMatchObject([{ actorName: "Fictional admin", reason: limits.reason }]);
});

it("revokes sessions on deactivation and blocking and preserves the actor and reason", async () => {
  const path = `/customers/${required(customers, "owner")}`;
  const access = (action: string) =>
    patch("admin", path + "/access", {
      action,
      reason: "Fictional access review",
    });
  await patch("staff", path + "/access", {
    action: "BLOCK",
    reason: "Fictional access review",
  }).expect(403);
  for (const action of ["DEACTIVATE", "BLOCK"]) {
    const old = required(cookies, "owner");
    await access(action).expect(204);
    await get("owner", "/api/v1/accounts").expect(401);
    await login("owner").expect(401);
    await access("ACTIVATE").expect(204);
    await request(app).get("/api/v1/accounts").set("Cookie", old).expect(401);
    cookies.set("owner", await loginCookie("owner"));
  }
  const detail = await get("admin", prefix + path).expect(200);
  expect(detail.body.history.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "CUSTOMER_BLOCKED",
        actorName: "Fictional admin",
        reason: "Fictional access review",
      }),
      expect.objectContaining({ action: "CUSTOMER_DEACTIVATED" }),
    ]),
  );
  const staff = await get("staff", prefix + path).expect(200);
  expect(
    staff.body.history.events.every(
      (event: { action: string }) => !event.action.startsWith("CUSTOMER_"),
    ),
  ).toBe(true);
});
