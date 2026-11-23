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
  profileChangeRequests,
  staffPhotoRequests,
  users,
} from "../../src/db/schema.ts";
import { assertFinancialAccountEligible } from "../../src/modules/accounts/eligibility.ts";
import { authDigest } from "../../src/modules/auth/auth-config.ts";
import { hashCredential } from "../../src/modules/auth/credentials.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

const origin = "http://localhost:3000";
const password = "Isolated management fixture";
const run = randomUUID();
const people = ["admin", "second-admin", "staff", "owner", "neighbor"] as const;
type Person = (typeof people)[number];
const address = (person: Person) => `${person}-${run}@bankbolt.example`;
const identities = new Map<Person, string>();
const customers = new Map<Person, string>();
const cookies = new Map<Person, string>();
const accounts: string[] = [];
let database: ReturnType<typeof getDatabase> | undefined;
const prefix = "/api/v1/management";
const profileUrl = "/api/v1/profile";
const updatedEmail = `updated-${run}@bankbolt.example`;

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
      person === "admin" || person === "second-admin"
        ? "ADMIN"
        : person === "staff"
          ? "STAFF"
          : "CUSTOMER";
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
        .delete(staffPhotoRequests)
        .where(inArray(staffPhotoRequests.staffId, [...identities.values()]));
      await database
        .delete(profileChangeRequests)
        .where(
          inArray(profileChangeRequests.customerId, [...customers.values()]),
        );
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
          [...people.map(address), updatedEmail].map((email) =>
            authDigest("login", email),
          ),
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

function changeProfile(
  person: Person,
  method: "patch" | "post",
  path: string,
  body: object,
) {
  const client = request(app);
  return client[method](profileUrl + path)
    .set("Origin", origin)
    .set("Cookie", required(cookies, person))
    .send(body);
}

it("keeps photo and occupation changes pending until Staff or Admin approves them", async () => {
  const ownerId = required(customers, "owner");
  const managed = `/customers/${ownerId}`;
  const submit = (changes: object) =>
    changeProfile("owner", "post", "/requests", {
      changes,
      reason: "Fictional profile review",
    });
  await request(app).get(profileUrl).expect(401);
  await get("staff", profileUrl).expect(403);
  await changeProfile("neighbor", "post", managed + "/requests", {
    changes: { occupation: "Wrong owner" },
    reason: "Fictional profile review",
  }).expect(403);
  await submit({ occupation: "Fictional editor" })
    .set("Origin", "https://untrusted.example")
    .expect(403);
  await submit({ photoUrl: "http://images.example.com/avatar.png" }).expect(
    400,
  );
  await submit({ photoUrl: null }).expect(400);

  const photoUrl = "https://images.example.com/portrait.png";
  const changes = { photoUrl, occupation: "Fictional editor" };
  await changeProfile("owner", "patch", "", changes)
    .expect(409)
    .expect(({ body }) =>
      expect(body.error.code).toBe("PROFILE_REVIEW_REQUIRED"),
    );
  await changeProfile("staff", "patch", managed, changes).expect(409);
  const submitted = await submit(changes).expect(201);
  const proposal = submitted.body.request;
  expect(proposal).toMatchObject({
    status: "PENDING",
    personalChanges: changes,
  });

  const current = await get("owner", profileUrl).expect(200);
  expect(current.body.profile).toMatchObject({
    photoUrl: null,
    occupation: null,
  });
  expect(current.body.requests[0]).toMatchObject({
    id: proposal.id,
    status: "PENDING",
  });
  const before = await get("owner", "/api/v1/auth/workspaces/customer").expect(
    200,
  );
  expect(before.body.user.photoUrl).toBeNull();
  const queue = await get("staff", profileUrl + "/review").expect(200);
  expect(queue.body.requests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: proposal.id,
        canReview: true,
        currentProfile: expect.objectContaining({
          photoUrl: null,
          occupation: null,
        }),
      }),
    ]),
  );

  const approval = {
    status: "APPROVED",
    reason: "Reviewed the fictional profile details",
  };
  await changeProfile(
    "staff",
    "patch",
    `/review/${proposal.id}`,
    approval,
  ).expect(204);
  const approved = await get("owner", profileUrl).expect(200);
  expect(approved.body.profile).toMatchObject(changes);
  const after = await get("owner", "/api/v1/auth/workspaces/customer").expect(
    200,
  );
  expect(after.body.user.photoUrl).toBe(photoUrl);

  const clear = { photoUrl: null, occupation: null };
  const removal = await submit(clear).expect(201);
  await changeProfile("admin", "patch", `/review/${removal.body.request.id}`, {
    status: "REJECTED",
    reason: "Keep the approved profile details",
  }).expect(204);
  const rejected = await get("owner", profileUrl).expect(200);
  expect(rejected.body.profile).toMatchObject(changes);
  expect(rejected.body.requests[0]).toMatchObject({
    status: "REJECTED",
    personalChanges: clear,
  });

  const nextRemoval = await submit(clear).expect(201);
  await changeProfile(
    "admin",
    "patch",
    `/review/${nextRemoval.body.request.id}`,
    approval,
  ).expect(204);
  const cleared = await get("owner", profileUrl).expect(200);
  expect(cleared.body.profile).toMatchObject(clear);
  const neighbor = await get("neighbor", profileUrl).expect(200);
  expect(neighbor.body.profile).toMatchObject(clear);
});

it("reviews a contact change once, revokes old sessions, and records the review in audit history", async () => {
  const body = {
    changes: { email: updatedEmail, phone: "+8801700000000" },
    reason: "Fictional updated contact information",
  };
  const submissions = await Promise.all([
    changeProfile("owner", "post", "/requests", body),
    changeProfile("owner", "post", "/requests", body),
  ]);
  expect(submissions.map(({ status }) => status).sort()).toEqual([201, 409]);
  const pending = submissions.find(({ status }) => status === 201)?.body
    .request;
  expect(pending).toMatchObject({ status: "PENDING", ...body.changes });
  const before = await get("owner", profileUrl).expect(200);
  expect(before.body.profile.email).toBe(address("owner"));
  expect(before.body.requests[0]).toMatchObject({
    id: pending.id,
    status: "PENDING",
  });
  await get("neighbor", profileUrl + "/review").expect(403);
  const queue = await get("admin", profileUrl + "/review").expect(200);
  expect(queue.body.requests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: pending.id,
        canReview: true,
        customerId: required(customers, "owner"),
      }),
    ]),
  );
  const path = `/review/${pending.id}`;
  const decision = {
    status: "APPROVED",
    reason: "Verified fictional identity and contact",
  };
  await changeProfile("neighbor", "patch", path, decision).expect(403);
  const decisions = await Promise.all([
    changeProfile("admin", "patch", path, decision),
    changeProfile("admin", "patch", path, decision),
  ]);
  expect(decisions.map(({ status }) => status).sort()).toEqual([204, 409]);
  await get("owner", "/api/v1/auth/me").expect(401);
  await login("owner").expect(401);
  const restored = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .send({ email: updatedEmail, password })
    .expect(200);
  expect(restored.body.user.email).toBe(updatedEmail);
  const detail = await get(
    "admin",
    `${prefix}/customers/${required(customers, "owner")}`,
  ).expect(200);
  expect(detail.body.customer).toMatchObject(body.changes);
  expect(detail.body.profileRequests[0]).toMatchObject({
    id: pending.id,
    status: "APPROVED",
    reviewReason: decision.reason,
  });
  const audit = await get(
    "admin",
    `/api/v1/audit?category=MANAGEMENT&search=${required(customers, "owner")}`,
  ).expect(200);
  expect(audit.body.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "PROFILE_CHANGE_REQUESTED",
        actorId: required(identities, "owner"),
      }),
      expect.objectContaining({
        action: "PROFILE_CHANGE_APPROVED",
        actorId: required(identities, "admin"),
      }),
    ]),
  );
  expect(JSON.stringify(audit.body)).not.toContain(updatedEmail);
});

it("keeps requests pending on an email conflict and rejects self-review", async () => {
  const managed = `/customers/${required(customers, "neighbor")}/requests`;
  const proposed = await changeProfile("staff", "post", managed, {
    changes: { email: address("admin"), fullName: "Fictional replacement" },
    reason: "Fictional update requested in branch",
  }).expect(201);
  const path = `/review/${proposed.body.request.id}`;
  await changeProfile("staff", "patch", path, {
    status: "APPROVED",
    reason: "Identity reviewed",
  }).expect(403);
  await changeProfile("admin", "patch", path, {
    status: "APPROVED",
    reason: "Identity reviewed",
  })
    .expect(409)
    .expect(({ body }) => expect(body.error.code).toBe("EMAIL_IN_USE"));
  const pending = await get("neighbor", profileUrl).expect(200);
  expect(pending.body.profile).toMatchObject({
    email: address("neighbor"),
    fullName: "Fictional neighbor",
  });
  expect(pending.body.requests[0].status).toBe("PENDING");
  await changeProfile("admin", "patch", path, {
    status: "REJECTED",
    reason: "Proposed email unavailable",
  }).expect(204);
  const initiated = await changeProfile("admin", "post", managed, {
    changes: { address: "Another fictional address" },
    reason: "Fictional branch request",
  }).expect(201);
  await changeProfile(
    "admin",
    "patch",
    `/review/${initiated.body.request.id}`,
    {
      status: "APPROVED",
      reason: "Fictional review",
    },
  ).expect(403);
  const after = await get("neighbor", profileUrl).expect(200);
  expect(after.body.profile.address).toBe("Fictional Dhaka address");
  expect(
    after.body.requests.map(({ status }: { status: string }) => status),
  ).toEqual(["PENDING", "REJECTED"]);
});

it("publishes operator photos according to role and records one Staff review decision", async () => {
  const photo = profileUrl + "/operator-photo";
  const me = "/api/v1/auth/me";
  const first = "https://example.com/first.png";
  const other = "https://example.com/other.png";
  const mutate = (
    person: Person,
    method: "put" | "post" | "patch",
    path: string,
    body: object,
    from = origin,
  ) => {
    const agent = request(app);
    return agent[method](photo + path)
      .set("Cookie", required(cookies, person))
      .set("Origin", from)
      .send(body);
  };
  const decide = (
    person: Person,
    id: string,
    status: "APPROVED" | "REJECTED",
  ) =>
    mutate(person, "patch", "/review/" + id, {
      status,
      reason: "Test review decision",
    });

  await get("neighbor", photo).expect(403);
  await get("staff", photo + "/review").expect(403);
  await mutate("staff", "put", "", { photoUrl: first }).expect(403);
  await mutate("admin", "post", "/requests", { photoUrl: first }).expect(403);
  await mutate("admin", "put", "", {
    photoUrl: "http://example.com/first.png",
  }).expect(400);
  await mutate(
    "admin",
    "put",
    "",
    { photoUrl: first },
    "https://example.com",
  ).expect(403);
  await mutate("admin", "put", "", { photoUrl: first }).expect(204);
  expect((await get("admin", me).expect(200)).body.user.photoUrl).toBe(first);
  expect((await login("admin").expect(200)).body.user.photoUrl).toBe(first);
  await mutate("admin", "put", "", { photoUrl: other }).expect(204);
  expect((await get("admin", me).expect(200)).body.user.photoUrl).toBe(other);
  await mutate("admin", "put", "", { photoUrl: null }).expect(204);
  expect((await get("admin", me).expect(200)).body.user.photoUrl).toBeNull();

  const submissions = await Promise.all([
    mutate("staff", "post", "/requests", { photoUrl: first }),
    mutate("staff", "post", "/requests", { photoUrl: first }),
  ]);
  expect(submissions.map((result) => result.status).sort()).toEqual([201, 409]);
  const id = submissions.find((result) => result.status === 201)!.body.request
    .id;
  expect((await get("staff", me).expect(200)).body.user.photoUrl).toBeNull();
  expect((await get("staff", photo).expect(200)).body.request.status).toBe(
    "PENDING",
  );
  expect(
    (await get("admin", photo + "/review").expect(200)).body.requests,
  ).toContainEqual(
    expect.objectContaining({ id, photoUrl: first, currentPhotoUrl: null }),
  );
  await decide("staff", id, "APPROVED").expect(403);

  const decisions = await Promise.all([
    decide("admin", id, "APPROVED"),
    decide("second-admin", id, "APPROVED"),
  ]);
  expect(decisions.map((result) => result.status).sort()).toEqual([204, 409]);
  expect((await get("staff", me).expect(200)).body.user.photoUrl).toBe(first);
  expect((await login("staff").expect(200)).body.user.photoUrl).toBe(first);
  const [review] = await database!
    .select()
    .from(staffPhotoRequests)
    .where(eq(staffPhotoRequests.id, id));
  expect([
    required(identities, "admin"),
    required(identities, "second-admin"),
  ]).toContain(review.reviewedBy);
  expect(review.reviewedAt).toBeInstanceOf(Date);

  const rejected = (
    await mutate("staff", "post", "/requests", { photoUrl: other }).expect(201)
  ).body.request.id;
  await decide("admin", rejected, "REJECTED").expect(204);
  expect((await get("staff", photo).expect(200)).body.request).toMatchObject({
    status: "REJECTED",
    reviewReason: "Test review decision",
  });
  expect((await get("staff", me).expect(200)).body.user.photoUrl).toBe(first);

  const removal = (
    await mutate("staff", "post", "/requests", { photoUrl: null }).expect(201)
  ).body.request.id;
  expect((await get("staff", me).expect(200)).body.user.photoUrl).toBe(first);
  await decide("admin", removal, "APPROVED").expect(204);
  expect((await get("staff", me).expect(200)).body.user.photoUrl).toBeNull();
});
