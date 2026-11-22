import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import app from "../../src/app.ts";
import { getDatabase } from "../../src/db/client.ts";
import {
  authAttempts,
  bankAccounts,
  cashRequests,
  customerProfiles,
  transactionFlags,
  transactions,
  users,
} from "../../src/db/schema.ts";
import { maxPoisha } from "../../src/lib/money.ts";
import { authDigest } from "../../src/modules/auth/auth-config.ts";
import { hashCredential } from "../../src/modules/auth/credentials.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

const origin = "http://localhost:3000";
const password = "Fictional cash request test password";
const prefix = "/api/v1/cash-requests";
const roles = {
  owner: "CUSTOMER",
  neighbor: "CUSTOMER",
  staff: "STAFF",
  otherStaff: "STAFF",
  admin: "ADMIN",
} as const;
type Person = keyof typeof roles;
const people = Object.keys(roles) as Person[];
const run = randomUUID();
const address = (person: Person) =>
  `cash-${person.toLowerCase()}-${run}@bankbolt.example`;
const ids = new Map<Person, string>();
const cookies = new Map<Person, string>();
const profiles = new Map<Person, string>();
const accountIds = new Map<Person, string>();
let db: ReturnType<typeof getDatabase>;
let ownerAccount: typeof bankAccounts.$inferSelect;

function post(person: Person, path: string, body?: object) {
  const call = request(app)
    .post(prefix + path)
    .set("Origin", origin)
    .set("Cookie", cookies.get(person)!);
  return body ? call.send(body) : call;
}

function get(person: Person, path = "") {
  return request(app)
    .get(prefix + path)
    .set("Cookie", cookies.get(person)!);
}

function input(overrides = {}) {
  return {
    accountId: ownerAccount.id,
    type: "WITHDRAWAL",
    amountPoisha: "10000",
    description: "Fictional counter request",
    ...overrides,
  };
}

async function submit(overrides = {}) {
  const result = await post("owner", "", input(overrides)).expect(201);
  return result.body.request.id as string;
}

async function pending(requestId: string) {
  const [stored] = await db
    .select()
    .from(cashRequests)
    .where(eq(cashRequests.id, requestId));
  expect(stored).toMatchObject({
    status: "PENDING",
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
  });
}

function postings(...requestIds: string[]) {
  return db
    .select()
    .from(transactions)
    .where(inArray(transactions.cashRequestId, requestIds));
}

async function expectBalance(value: bigint, held = 0n) {
  const [account] = await db
    .select({
      balance: bankAccounts.balancePoisha,
      held: bankAccounts.heldBalancePoisha,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, ownerAccount.id));
  expect(account.balance).toBe(value);
  expect(account.held).toBe(held);
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
  db = getDatabase();
  await migrate(db, { migrationsFolder: "./drizzle" });
  const passwordHash = await hashCredential(password);
  for (const person of people) {
    const [user] = await db
      .insert(users)
      .values({
        fullName: `Fictional cash ${person}`,
        email: address(person),
        role: roles[person],
        passwordHash,
      })
      .returning({ id: users.id });
    ids.set(person, user.id);
    if (roles[person] === "CUSTOMER") {
      const [profile] = await db
        .insert(customerProfiles)
        .values({
          userId: user.id,
          dateOfBirth: "1995-01-02",
          identityReference: randomUUID(),
          phone: "+1-202-555-0143",
          address: "Fictional Dhaka address",
          verificationStatus: "VERIFIED",
        })
        .returning({ id: customerProfiles.id });
      profiles.set(person, profile.id);
      const [account] = await db
        .insert(bankAccounts)
        .values({
          customerId: profile.id,
          creationKey: randomUUID(),
          type: "SAVINGS",
          status: "ACTIVE",
          balancePoisha: 30_000n,
        })
        .returning();
      accountIds.set(person, account.id);
      if (person === "owner") ownerAccount = account;
    }
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: address(person), password })
      .expect(200);
    const raw: unknown = login.headers["set-cookie"]?.[0];
    if (typeof raw !== "string") throw new Error("Expected a session cookie.");
    cookies.set(person, raw.split(";")[0]);
  }
}, 20_000);

async function clearRequests() {
  const ownerIds = [...profiles.values()];
  const requestIds = db
    .select({ id: cashRequests.id })
    .from(cashRequests)
    .where(inArray(cashRequests.customerId, ownerIds));
  const transactionIds = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(inArray(transactions.cashRequestId, requestIds));
  await db
    .delete(transactionFlags)
    .where(inArray(transactionFlags.transactionId, transactionIds));
  await db
    .delete(transactions)
    .where(inArray(transactions.cashRequestId, requestIds));
  await db
    .delete(cashRequests)
    .where(inArray(cashRequests.customerId, ownerIds));
}

beforeEach(async () => {
  await clearRequests();
  await db
    .update(users)
    .set({ role: "CUSTOMER", accessActive: true, blocked: false })
    .where(eq(users.id, ids.get("owner")!));
  await db
    .update(bankAccounts)
    .set({ status: "ACTIVE", balancePoisha: 30_000n, heldBalancePoisha: 0n })
    .where(inArray(bankAccounts.id, [...accountIds.values()]));
});

afterAll(async () => {
  try {
    if (db && ids.size) {
      await clearRequests();
      await db
        .delete(bankAccounts)
        .where(inArray(bankAccounts.id, [...accountIds.values()]));
      await db.delete(authAttempts).where(
        inArray(
          authAttempts.subject,
          people.map((person) => authDigest("login", address(person))),
        ),
      );
      await db.delete(users).where(inArray(users.id, [...ids.values()]));
    }
  } finally {
    await db?.$client.end();
    vi.unstubAllEnvs();
  }
});

it("creates pending requests with server dates, exact amounts and withdrawal holds", async () => {
  await request(app).get(prefix).expect(401);
  await post("staff", "", input()).expect(403);
  await post("neighbor", "", input()).expect(404);
  await post("owner", "", input())
    .set("Origin", "https://example.invalid")
    .expect(403);
  await post("owner", "", input({ amountPoisha: "0" })).expect(400);
  await post("owner", "", input({ amountPoisha: 100 })).expect(400);
  await post(
    "owner",
    "",
    input({ createdAt: "2020-01-01", status: "APPROVED" }),
  ).expect(400);
  const response = await post(
    "owner",
    "",
    input({ type: "DEPOSIT", amountPoisha: "9007199254740993" }),
  ).expect(201);
  const row = response.body.request;
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(row).toMatchObject({
    customerId: profiles.get("owner"),
    accountNumber: ownerAccount.accountNumber,
    amountPoisha: "9007199254740993",
    status: "PENDING",
    type: "DEPOSIT",
    transactionReference: null,
  });
  expect(typeof row.createdAt).toBe("string");
  expect(Math.abs(Date.now() - Date.parse(row.createdAt))).toBeLessThan(10_000);
  await expectBalance(30_000n);
  expect(await postings(row.id)).toHaveLength(0);
  await get("owner", `/${row.id}`).expect(200, response.body);
  await get("neighbor", `/${row.id}`).expect(404);
  await get("neighbor").expect(200, { requests: [], hasNextPage: false });
  await submit();
  await expectBalance(30_000n, 10_000n);
  await db
    .update(bankAccounts)
    .set({ status: "FROZEN" })
    .where(eq(bankAccounts.id, ownerAccount.id));
  await post("owner", "", input()).expect(409);
});

it("lists the Staff/Admin queue and filters a customer's requests with pagination", async () => {
  const fixture = {
    accountId: ownerAccount.id,
    customerId: profiles.get("owner")!,
    type: "DEPOSIT",
    amountPoisha: 100n,
    description: "Fictional queue request",
  } as const;
  await db
    .insert(cashRequests)
    .values(Array.from({ length: 21 }, () => fixture));
  const withdrawal = await submit();
  const filter = { type: "DEPOSIT", status: "PENDING" };
  const first = (await get("owner").query(filter).expect(200)).body;
  const next = (
    await get("owner")
      .query({ ...filter, page: 2 })
      .expect(200)
  ).body;
  expect(first.requests).toHaveLength(20);
  expect(first.hasNextPage).toBe(true);
  expect(next.requests).toHaveLength(1);
  expect(next.hasNextPage).toBe(false);
  expect(first.requests.map((row: { id: string }) => row.id)).not.toContain(
    next.requests[0].id,
  );
  await get("neighbor")
    .query(filter)
    .expect(200, { requests: [], hasNextPage: false });
  for (const person of ["staff", "admin"] as const) {
    const queue = await get(person)
      .query({ type: "WITHDRAWAL", status: "PENDING" })
      .expect(200);
    expect(queue.body.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: withdrawal,
          customerName: "Fictional cash owner",
          reviewerName: null,
        }),
      ]),
    );
    await get(person, `/${withdrawal}`).expect(200);
  }
});

it("posts both approval types once with linked history and no fee", async () => {
  const deposit = await submit({ type: "DEPOSIT", amountPoisha: "125" });
  const withdrawal = await submit({ amountPoisha: "1000" });
  await post("owner", `/${deposit}/approve`).expect(403);
  await post("admin", `/${deposit}/approve`, { amountPoisha: "500" }).expect(
    400,
  );
  await post("staff", `/${deposit}/approve`)
    .set("Origin", "https://example.invalid")
    .expect(403);
  const credited = await post("staff", `/${deposit}/approve`).expect(200);
  await expectBalance(30_125n, 1000n);
  const debited = await post("admin", `/${withdrawal}/approve`).expect(200);
  await expectBalance(29_125n);
  expect(credited.body.request).toMatchObject({
    status: "APPROVED",
    reviewedBy: ids.get("staff"),
    rejectionReason: null,
  });
  expect(debited.body.request).toMatchObject({
    status: "APPROVED",
    reviewedBy: ids.get("admin"),
    rejectionReason: null,
  });
  expect(await postings(deposit, withdrawal)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        cashRequestId: deposit,
        status: "COMPLETED",
        type: "DEPOSIT",
        receiverAccountId: ownerAccount.id,
        senderAccountId: null,
        amountPoisha: 125n,
        feePoisha: 0n,
        reference: credited.body.request.transactionReference,
      }),
      expect.objectContaining({
        cashRequestId: withdrawal,
        status: "COMPLETED",
        type: "WITHDRAWAL",
        senderAccountId: ownerAccount.id,
        receiverAccountId: null,
        amountPoisha: 1_000n,
        feePoisha: 0n,
        reference: debited.body.request.transactionReference,
      }),
    ]),
  );
  expect(await postings(deposit, withdrawal)).toHaveLength(2);
  await post("admin", `/${deposit}/approve`).expect(409);
  await post("admin", `/${deposit}/reject`, {
    reason: "Fictional rejection",
  }).expect(409);
  await get("owner", `/${deposit}`).expect(200, credited.body);
  const reviewDetail = await get("admin", `/${deposit}`).expect(200);
  expect(reviewDetail.body.request).toMatchObject({
    customerName: "Fictional cash owner",
    reviewerName: "Fictional cash staff",
    reviewedAt: credited.body.request.reviewedAt,
  });
  const history = await request(app)
    .get(`/api/v1/transactions/${debited.body.request.transactionReference}`)
    .set("Cookie", cookies.get("owner")!)
    .expect(200);
  expect(history.body.transaction).toMatchObject({
    status: "COMPLETED",
    direction: "OUTGOING",
    type: "WITHDRAWAL",
  });
});

it("rejects a pending request with a reason without changing a frozen account", async () => {
  const id = await submit();
  await db
    .update(bankAccounts)
    .set({ status: "FROZEN" })
    .where(eq(bankAccounts.id, ownerAccount.id));
  await post("owner", `/${id}/reject`, { reason: "Change of mind" }).expect(
    403,
  );
  await post("staff", `/${id}/reject`, { reason: " " }).expect(400);
  const rejected = await post("staff", `/${id}/reject`, {
    reason: " Review declined ",
  }).expect(200);
  expect(rejected.body.request).toMatchObject({
    status: "REJECTED",
    reviewedBy: ids.get("staff"),
    reviewedAt: expect.any(String),
    rejectionReason: "Review declined",
    transactionReference: null,
  });
  await post("admin", `/${id}/approve`).expect(409);
  await get("owner", `/${id}`).expect(200, rejected.body);
  await expectBalance(30_000n);
  expect(await postings(id)).toHaveLength(0);
});

it.each(["STAFF", "ADMIN"] as const)(
  "denies self-review after a customer becomes %s",
  async (role) => {
    const id = await submit();
    await db
      .update(users)
      .set({ role })
      .where(eq(users.id, ids.get("owner")!));
    const response = await post("owner", `/${id}/approve`).expect(403);
    expect(response.body.error.code).toBe("SELF_REVIEW");
    await post("owner", `/${id}/reject`, { reason: "Self review" }).expect(403);
    await pending(id);
    expect(await postings(id)).toHaveLength(0);
    await expectBalance(30_000n, 10_000n);
  },
);

it("rechecks balance and account restrictions at approval time", async () => {
  const withdrawal = await submit();
  const deposit = await submit({ type: "DEPOSIT" });
  const account = eq(bankAccounts.id, ownerAccount.id);
  // Requests created before the migration had no reservation.
  await db
    .update(cashRequests)
    .set({ fundsReserved: false })
    .where(eq(cashRequests.id, withdrawal));
  await db
    .update(bankAccounts)
    .set({ balancePoisha: 1n, heldBalancePoisha: 0n })
    .where(account);
  const short = await post("staff", `/${withdrawal}/approve`).expect(422);
  expect(short.body.error.code).toBe("INSUFFICIENT_FUNDS");
  await db
    .update(bankAccounts)
    .set({ balancePoisha: 30_000n, status: "FROZEN" })
    .where(account);
  const restricted = await post("admin", `/${withdrawal}/approve`).expect(409);
  expect(restricted.body.error.code).toBe("ACCOUNT_RESTRICTED");
  await post("staff", `/${deposit}/approve`).expect(409);
  await db
    .update(bankAccounts)
    .set({ balancePoisha: maxPoisha, status: "ACTIVE" })
    .where(account);
  const overflow = await post("admin", `/${deposit}/approve`).expect(422);
  expect(overflow.body.error.code).toBe("ACCOUNT_BALANCE_LIMIT");
  await pending(withdrawal);
  await pending(deposit);
  expect(await postings(withdrawal, deposit)).toHaveLength(0);
  await expectBalance(maxPoisha);
});

it("allows only one reviewer to decide a request and enforces the posting link", async () => {
  const id = await submit();
  const results = await Promise.all([
    post("admin", `/${id}/approve`),
    post("staff", `/${id}/approve`),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(results.find((result) => result.status === 409)?.body.error.code).toBe(
    "CASH_REQUEST_DECIDED",
  );
  const [row] = await postings(id);
  expect(await postings(id)).toHaveLength(1);
  await expectBalance(20_000n);
  const posting = {
    type: row.type,
    status: row.status,
    senderAccountId: row.senderAccountId,
    amountPoisha: row.amountPoisha,
    description: row.description,
    cashRequestId: id,
  };
  await expect(db.insert(transactions).values(posting)).rejects.toMatchObject({
    cause: { constraint: "transactions_cash_request_unique" },
  });
  await expect(
    db.insert(transactions).values({ ...posting, cashRequestId: randomUUID() }),
  ).rejects.toMatchObject({
    cause: { constraint: "transactions_cash_request_id_cash_requests_id_fk" },
  });
});

it("persists one outcome when approval and rejection race", async () => {
  const id = await submit();
  const [approve, reject] = await Promise.all([
    post("staff", `/${id}/approve`),
    post("admin", `/${id}/reject`, { reason: "Fictional review decision" }),
  ]);
  expect([approve.status, reject.status].sort()).toEqual([200, 409]);
  const approved = approve.status === 200;
  const winner = approved ? approve : reject;
  await get("owner", `/${id}`).expect(200, winner.body);
  expect(winner.body.request.status).toBe(approved ? "APPROVED" : "REJECTED");
  expect(await postings(id)).toHaveLength(approved ? 1 : 0);
  await expectBalance(approved ? 20_000n : 30_000n);
});

it("serializes concurrent withdrawals against the same available balance", async () => {
  const results = await Promise.all([
    post("owner", "", input({ amountPoisha: "20000" })),
    post("owner", "", input({ amountPoisha: "20000" })),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([201, 422]);
  const id = results.find((result) => result.status === 201)!.body.request.id;
  await expectBalance(30_000n, 20_000n);
  await post("staff", `/${id}/approve`).expect(200);
  expect(await postings(id)).toHaveLength(1);
  await expectBalance(10_000n);
});

it("allows only the owner to cancel and serializes cancellation with approval", async () => {
  const id = await submit();
  await post("neighbor", `/${id}/cancel`).expect(404);
  await post("staff", `/${id}/cancel`).expect(403);
  await post("owner", `/${id}/cancel`)
    .set("Origin", "https://example.invalid")
    .expect(403);
  const [cancel, approve] = await Promise.all([
    post("owner", `/${id}/cancel`),
    post("staff", `/${id}/approve`),
  ]);
  expect([cancel.status, approve.status].sort()).toEqual([200, 409]);
  const cancelled = cancel.status === 200;
  expect(await postings(id)).toHaveLength(cancelled ? 0 : 1);
  await expectBalance(cancelled ? 30_000n : 20_000n);
  await post("owner", `/${id}/cancel`).expect(409);

  const pendingId = await submit();
  const result = await post("owner", `/${pendingId}/cancel`).expect(200);
  expect(result.body.request).toMatchObject({
    status: "CANCELLED",
    reviewedBy: null,
  });
  expect(result.body.request.cancelledAt).toEqual(expect.any(String));
  expect(await postings(pendingId)).toHaveLength(0);
  await expectBalance(cancelled ? 30_000n : 20_000n);
});

it("rolls back the balance and leaves the request pending if posting fails", async () => {
  const id = await submit({ description: "cash-test forced posting failure" });
  await db.execute(sql`alter table transactions add constraint cash_test_reject_posting
    check (description <> 'cash-test forced posting failure') not valid`);
  try {
    await post("staff", `/${id}/approve`).expect(500);
    await pending(id);
    await expectBalance(30_000n, 10_000n);
    expect(await postings(id)).toHaveLength(0);
  } finally {
    await db.execute(
      sql`alter table transactions drop constraint cash_test_reject_posting`,
    );
  }
  await post("admin", `/${id}/approve`).expect(200);
  await expectBalance(20_000n);
  expect(await postings(id)).toHaveLength(1);
});

it.each(["PENDING", "FROZEN", "DEACTIVATED"] as const)(
  "rechecks an account that becomes %s after submission",
  async (status) => {
    const id = await submit();
    await db
      .update(bankAccounts)
      .set({ status })
      .where(eq(bankAccounts.id, ownerAccount.id));
    const response = await post("staff", `/${id}/approve`).expect(409);
    expect(response.body.error.code).toBe("ACCOUNT_RESTRICTED");
    await pending(id);
    expect(await postings(id)).toHaveLength(0);
    await expectBalance(30_000n, 10_000n);
  },
);

it("blocks cash review by customers and after the account holder loses access", async () => {
  const id = await submit({ type: "DEPOSIT" });
  await post("neighbor", `/${id}/approve`).expect(403);
  await post("neighbor", `/${id}/reject`, {
    reason: "Fictional rejection",
  }).expect(403);
  await db
    .update(users)
    .set({ blocked: true })
    .where(eq(users.id, ids.get("owner")!));
  const response = await post("admin", `/${id}/approve`).expect(409);
  expect(response.body.error.code).toBe("ACCOUNT_RESTRICTED");
  await pending(id);
  expect(await postings(id)).toHaveLength(0);
  await expectBalance(30_000n);
});

const flagsPath = "/api/v1/transaction-flags";
const transactionPath = (reference: string) =>
  `/api/v1/transactions/${reference}`;
const flagReason = "Fictional review of unusual counter activity";

function flagPost(person: Person, path: string, body: object) {
  return request(app)
    .post(path)
    .set("Origin", origin)
    .set("Cookie", cookies.get(person)!)
    .send(body);
}

function flagGet(person: Person, path: string) {
  return request(app).get(path).set("Cookie", cookies.get(person)!);
}

async function approvedDeposit() {
  const id = await submit({ type: "DEPOSIT" });
  await post("staff", `/${id}/approve`).expect(200);
  const [transaction] = await postings(id);
  return { id, transaction };
}

it("enforces flag roles, origin, reason and transaction existence", async () => {
  const { id, transaction } = await approvedDeposit();
  const path = transactionPath(transaction.reference);
  await request(app)
    .post(`${path}/flag`)
    .set("Origin", origin)
    .send({ reason: flagReason })
    .expect(401);
  await flagPost("owner", `${path}/flag`, { reason: flagReason }).expect(403);
  await flagPost("admin", `${path}/flag`, { reason: flagReason }).expect(403);
  await flagPost("staff", `${path}/flag`, { reason: flagReason })
    .set("Origin", "https://example.invalid")
    .expect(403);
  await flagPost("staff", `${path}/flag`, { reason: "  " }).expect(400);
  await flagPost("staff", `${path}/flag`, {
    reason: flagReason,
    flaggedBy: ids.get("admin"),
  }).expect(400);
  await flagPost("staff", `${transactionPath(randomUUID())}/flag`, {
    reason: flagReason,
  }).expect(404);
  await flagGet("owner", `${path}/flags`).expect(403);
  await flagGet("staff", flagsPath).expect(403);
  const related = await flagGet("admin", `${path}/flags`).expect(200, {
    flags: [],
    hasNextPage: false,
  });
  expect(related.headers["cache-control"]).toBe("no-store");
  expect(await postings(id)).toEqual([transaction]);
  await expectBalance(40_000n);
});

it("records one open flag, isolates Staff histories, and resolves once with an audit trail", async () => {
  const { id, transaction } = await approvedDeposit();
  const path = transactionPath(transaction.reference);
  const attempts = await Promise.all([
    flagPost("staff", `${path}/flag`, { reason: flagReason }),
    flagPost("otherStaff", `${path}/flag`, { reason: flagReason }),
  ]);
  expect(attempts.map((result) => result.status).sort()).toEqual([201, 409]);
  const creator = attempts[0].status === 201 ? "staff" : "otherStaff";
  const other = creator === "staff" ? "otherStaff" : "staff";
  const flagId = attempts.find((result) => result.status === 201)?.body.flag
    .id as string;
  const related = await flagGet(creator, `${path}/flags`).expect(200);
  expect(related.body.flags).toEqual([
    expect.objectContaining({
      id: flagId,
      reason: flagReason,
      status: "OPEN",
      reporterName: `Fictional cash ${creator}`,
    }),
  ]);
  await flagGet(other, `${path}/flags`).expect(200, {
    flags: [],
    hasNextPage: false,
  });
  const queue = await flagGet("admin", flagsPath)
    .query({ status: "OPEN" })
    .expect(200);
  expect(queue.body.flags).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: flagId })]),
  );
  const resolvePath = `${flagsPath}/${flagId}/resolve`;
  await flagPost("owner", resolvePath, {}).expect(403);
  await flagPost("staff", resolvePath, {}).expect(403);
  await flagPost("admin", resolvePath, { resolvedBy: ids.get("staff") }).expect(
    400,
  );
  const resolutions = await Promise.all([
    flagPost("admin", resolvePath, { note: "Fictional review complete" }),
    flagPost("admin", resolvePath, { note: "Competing review" }),
  ]);
  expect(resolutions.map((result) => result.status).sort()).toEqual([200, 409]);
  const resolved = await flagGet("admin", `${path}/flags`).expect(200);
  expect(resolved.body.flags).toEqual([
    expect.objectContaining({
      id: flagId,
      status: "RESOLVED",
      resolverName: "Fictional cash admin",
      resolvedAt: expect.any(String),
      resolutionNote:
        resolutions[0].status === 200
          ? "Fictional review complete"
          : "Competing review",
    }),
  ]);
  const stored = await db
    .select()
    .from(transactionFlags)
    .where(eq(transactionFlags.transactionId, transaction.id));
  expect(stored).toEqual([
    expect.objectContaining({
      flaggedBy: ids.get(creator),
      resolvedBy: ids.get("admin"),
    }),
  ]);
  await flagPost("staff", `${path}/flag`, {
    reason: "Fictional follow-up",
  }).expect(201);
  const history = await flagGet("admin", `${path}/flags`).expect(200);
  expect(
    history.body.flags.map((flag: { status: string }) => flag.status),
  ).toEqual(["OPEN", "RESOLVED"]);
  expect(await postings(id)).toEqual([transaction]);
  await expectBalance(40_000n);
});
