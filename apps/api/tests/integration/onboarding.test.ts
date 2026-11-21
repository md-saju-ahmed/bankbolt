import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../../src/app.ts";
import { getDatabase } from "../../src/db/client.ts";
import {
  authAttempts,
  bankAccounts,
  customerProfiles,
  users,
} from "../../src/db/schema.ts";
import { authDigest } from "../../src/modules/auth/auth-config.ts";
import { hashCredential } from "../../src/modules/auth/credentials.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

const origin = "http://localhost:3000";
const password = "Isolated onboarding fixture";
const run = randomUUID();
const email = (key: string) => `${key}-${run}@bankbolt.example`;
const customers = "/api/v1/customers";
const fixtureEmails = [
  "staff",
  "admin",
  "viewer",
  "registered",
  "duplicate",
  "other",
].map(email);
let database: ReturnType<typeof getDatabase> | undefined;
let staffCookie: string;
let adminCookie: string;
let viewerCookie: string;
let staffId: string;
let adminId: string;

function profile(key: string) {
  return {
    fullName: "Fictional Onboarding Customer",
    email: email(key),
    phone: "+1-202-555-0110",
    dateOfBirth: "1994-01-02",
    address: "Fictional Dhaka address",
    identityReference: `${key}-${run}`,
    occupation: "Fictional editor",
    password,
  };
}

async function signIn(key: string) {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .send({ email: email(key), password })
    .expect(200);
  const header: unknown = response.headers["set-cookie"]?.[0];
  if (typeof header !== "string") throw new Error("Expected a session cookie");
  return { cookie: header.split(";")[0], id: response.body.user.id };
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
  await database.insert(users).values([
    {
      email: email("staff"),
      fullName: "Fictional Staff",
      passwordHash: hash,
      role: "STAFF",
    },
    {
      email: email("admin"),
      fullName: "Fictional Admin",
      passwordHash: hash,
      role: "ADMIN",
    },
    {
      email: email("viewer"),
      fullName: "Fictional Customer",
      passwordHash: hash,
      role: "CUSTOMER",
    },
  ]);
  ({ cookie: staffCookie, id: staffId } = await signIn("staff"));
  ({ cookie: adminCookie, id: adminId } = await signIn("admin"));
  ({ cookie: viewerCookie } = await signIn("viewer"));
});

afterAll(async () => {
  try {
    if (database) {
      const profiles = await database
        .select({ id: customerProfiles.id })
        .from(customerProfiles)
        .innerJoin(users, eq(users.id, customerProfiles.userId))
        .where(inArray(users.email, fixtureEmails));
      await database.delete(bankAccounts).where(
        inArray(
          bankAccounts.customerId,
          profiles.map(({ id }) => id),
        ),
      );
      await database.delete(customerProfiles).where(
        inArray(
          customerProfiles.id,
          profiles.map(({ id }) => id),
        ),
      );
      await database.delete(authAttempts).where(
        inArray(
          authAttempts.subject,
          fixtureEmails.map((address) => authDigest("login", address)),
        ),
      );
      await database.delete(users).where(inArray(users.email, fixtureEmails));
    }
  } finally {
    await database?.$client.end();
    vi.unstubAllEnvs();
  }
});

function register(key: string, cookie = staffCookie) {
  return request(app)
    .post(customers)
    .set("Origin", origin)
    .set("Cookie", cookie)
    .send(profile(key));
}

function review(customerId: string, status: string, cookie = staffCookie) {
  return request(app)
    .patch(`${customers}/${customerId}/verification`)
    .set("Origin", origin)
    .set("Cookie", cookie)
    .send({ status });
}

function openAccount(customerId: string, body: object, cookie = staffCookie) {
  return request(app)
    .post(`${customers}/${customerId}/accounts`)
    .set("Origin", origin)
    .set("Cookie", cookie)
    .send(body);
}

function activate(customerId: string, accountId: string, cookie = staffCookie) {
  return request(app)
    .post(`${customers}/${customerId}/accounts/${accountId}/activate`)
    .set("Origin", origin)
    .set("Cookie", cookie);
}

describe("customer onboarding and bank account safeguards", () => {
  it("requires authenticated staff and a trusted origin for registration and lookup", async () => {
    await request(app).post(customers).send(profile("duplicate")).expect(401);
    await register("duplicate", viewerCookie).expect(403);
    await request(app)
      .post(customers)
      .set("Cookie", staffCookie)
      .set("Origin", origin)
      .send({ ...profile("duplicate"), dateOfBirth: "0000-01-01" })
      .expect(400);
    await request(app)
      .post(customers)
      .set("Cookie", staffCookie)
      .send(profile("duplicate"))
      .expect(403);
    await request(app)
      .post(`${customers}/lookup`)
      .set("Cookie", staffCookie)
      .set("Origin", "https://untrusted.example")
      .send({ email: email("duplicate") })
      .expect(403);
  });

  it("registers, verifies and activates accounts with safe retry and ownership behavior", async () => {
    const registered = await register("registered")
      .expect(201)
      .expect("Cache-Control", "no-store");
    const customerId: string = registered.body.customer.id;
    expect(registered.body.customer.verificationStatus).toBe("PENDING");
    expect(registered.body.customer.identityReference).toBe(
      `registered-${run}`.toUpperCase(),
    );
    expect(JSON.stringify(registered.body)).not.toContain(password);
    expect(registered.body.customer).not.toHaveProperty("passwordHash");
    await signIn("registered");
    await register("registered").expect(409);
    const duplicate = {
      ...profile("duplicate"),
      identityReference: `registered-${run}`.toUpperCase(),
    };
    await request(app)
      .post(customers)
      .set("Origin", origin)
      .set("Cookie", staffCookie)
      .send(duplicate)
      .expect(409);
    expect(
      await getDatabase()
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email("duplicate"))),
    ).toEqual([]);

    const [read] = await getDatabase()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email("registered")));
    expect(read.passwordHash).toMatch(/^scrypt:/);
    const found = await request(app)
      .post(`${customers}/lookup`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ email: email("registered").toUpperCase() })
      .expect(200);
    expect(found.body.customer.id).toBe(customerId);

    const input = { type: "SAVINGS", requestId: randomUUID() };
    await openAccount(customerId, input).expect(409);
    const rejected = await review(customerId, "REJECTED", adminCookie).expect(
      200,
    );
    expect(rejected.body.customer).toMatchObject({
      verificationStatus: "REJECTED",
      verifiedBy: adminId,
      verifiedAt: expect.any(String),
    });
    await openAccount(customerId, input).expect(409);
    const verified = await review(customerId, "VERIFIED").expect(200);
    expect(verified.body.customer).toMatchObject({
      verificationStatus: "VERIFIED",
      verifiedBy: staffId,
      verifiedAt: expect.any(String),
    });

    await openAccount(customerId, { ...input, balancePoisha: "100" }).expect(
      400,
    );
    await openAccount(customerId, {
      ...input,
      businessName: "Fictional business",
    }).expect(400);
    await openAccount(customerId, input, viewerCookie).expect(403);
    const attempts = await Promise.all([
      openAccount(customerId, input),
      openAccount(customerId, input),
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 201]);
    const account = attempts[0].body.account;
    expect(attempts[1].body.account.id).toBe(account.id);
    expect(account).toMatchObject({
      status: "PENDING",
      balancePoisha: "0",
      transferLimitPoisha: "5000000",
      dailyTransferLimitPoisha: "20000000",
      accountNumber: expect.stringMatching(/^[0-9]{12}$/),
    });
    await openAccount(customerId, { ...input, type: "CURRENT" }).expect(409);
    const repeated = await openAccount(
      customerId,
      { ...input, requestId: randomUUID() },
      adminCookie,
    ).expect(201);
    expect(repeated.body.account.accountNumber).not.toBe(account.accountNumber);
    const business = await openAccount(customerId, {
      requestId: randomUUID(),
      type: "BUSINESS",
      businessName: "Fictional business",
      businessRegistrationReference: "SIM-BUSINESS",
    }).expect(201);
    expect(business.body.account).toMatchObject({
      businessName: "Fictional business",
      businessRegistrationReference: "SIM-BUSINESS",
    });
    await openAccount(customerId, {
      requestId: randomUUID(),
      type: "CURRENT",
    }).expect(201);

    await review(customerId, "PENDING").expect(200);
    await activate(customerId, account.id).expect(409);
    await review(customerId, "VERIFIED").expect(200);
    const [owner] = await getDatabase()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email("registered")));
    await getDatabase()
      .update(users)
      .set({ blocked: true })
      .where(eq(users.id, owner.id));
    await activate(customerId, account.id).expect(409);
    await openAccount(customerId, { ...input, requestId: randomUUID() }).expect(
      409,
    );
    await getDatabase()
      .update(users)
      .set({ blocked: false })
      .where(eq(users.id, owner.id));

    const other = await register("other", adminCookie).expect(201);
    await review(other.body.customer.id, "VERIFIED").expect(200);
    await activate(other.body.customer.id, account.id).expect(404);
    await activate(customerId, account.id, viewerCookie).expect(403);
    const active = await activate(customerId, account.id).expect(200);
    const replay = await activate(customerId, account.id, adminCookie).expect(
      200,
    );
    expect(active.body.account).toMatchObject({
      status: "ACTIVE",
      balancePoisha: "0",
      activatedAt: expect.any(String),
    });
    expect(replay.body).toEqual(active.body);
    const listed = await request(app)
      .get(`${customers}/${customerId}/accounts`)
      .set("Cookie", staffCookie)
      .expect(200);
    expect(listed.body.accounts).toHaveLength(4);
    await request(app)
      .get(`${customers}/${customerId}/accounts`)
      .set("Cookie", viewerCookie)
      .expect(403);

    const db = getDatabase();
    await expect(
      db
        .update(bankAccounts)
        .set({ balancePoisha: -1n })
        .where(eq(bankAccounts.id, account.id)),
    ).rejects.toMatchObject({
      cause: { constraint: "bank_accounts_nonnegative_balance" },
    });
    await expect(
      db
        .update(bankAccounts)
        .set({ accountNumber: "900000000000" })
        .where(eq(bankAccounts.id, account.id)),
    ).rejects.toMatchObject({
      cause: { constraint: "bank_accounts_immutable_number" },
    });
    await expect(
      db.insert(bankAccounts).values({
        customerId: randomUUID(),
        type: "SAVINGS",
        creationKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      db.insert(bankAccounts).values({
        customerId,
        type: "SAVINGS",
        creationKey: randomUUID(),
        accountNumber: account.accountNumber,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  }, 20_000);
});
