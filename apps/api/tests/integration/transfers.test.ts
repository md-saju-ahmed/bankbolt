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
  customerProfiles,
  transactions,
  users,
} from "../../src/db/schema.ts";
import { dhakaDate } from "../../src/lib/dhaka-date.ts";
import { maxPoisha } from "../../src/lib/money.ts";
import { authDigest } from "../../src/modules/auth/auth-config.ts";
import {
  hashCredential,
  verifyCredential,
} from "../../src/modules/auth/credentials.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

const origin = "http://localhost:3000";
const password = "Fictional transfer test password";
const pin = "651918";
const prefix = "/api/v1/transfers";
const fixtureRoles = {
  owner: "CUSTOMER",
  neighbor: "CUSTOMER",
  admin: "ADMIN",
  staff: "STAFF",
} as const;
type Person = keyof typeof fixtureRoles;
type Account = typeof bankAccounts.$inferSelect;
const people = Object.keys(fixtureRoles) as Person[];
const run = randomUUID();
const address = (person: Person) =>
  `transfer-${person}-${run}@bankbolt.example`;
const identities = new Map<Person, string>();
const profiles = new Map<Person, string>();
const cookies = new Map<Person, string>();
const accounts: Account[] = [];
let db: ReturnType<typeof getDatabase>;
let pinHash: string;
let source: Account;
let ownedRecipient: Account;
let otherRecipient: Account;

function post(payload: object, person: Person = "owner") {
  return request(app)
    .post(prefix)
    .set("Origin", origin)
    .set("Cookie", cookies.get(person)!)
    .send(payload);
}

function recover(key: string, person: Person = "owner") {
  return request(app)
    .get(`${prefix}/by-key/${key}`)
    .set("Cookie", cookies.get(person)!);
}

function changePin(body: object, person: Person = "owner") {
  return request(app)
    .put("/api/v1/auth/transaction-pin")
    .set("Origin", origin)
    .set("Cookie", cookies.get(person)!)
    .send(body);
}

function payload(overrides: object = {}) {
  return {
    sourceAccountId: source.id,
    recipientAccountNumber: otherRecipient.accountNumber,
    amountPoisha: "10000",
    description: "Fictional transfer",
    idempotencyKey: randomUUID(),
    pin,
    ...overrides,
  };
}

function postings() {
  return db
    .select()
    .from(transactions)
    .where(inArray(transactions.initiatedBy, [...identities.values()]));
}

async function expectBalances(expected: bigint[]) {
  const rows = await db
    .select()
    .from(bankAccounts)
    .where(
      inArray(
        bankAccounts.id,
        accounts.map(({ id }) => id),
      ),
    );
  expect(
    accounts.map(({ id }) => rows.find((row) => row.id === id)?.balancePoisha),
  ).toEqual(expected);
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
  pinHash = await hashCredential(pin);
  for (const person of people) {
    const role = fixtureRoles[person];
    const [user] = await db
      .insert(users)
      .values({
        email: address(person),
        role,
        fullName: `Fictional ${person}`,
        passwordHash,
      })
      .returning({ id: users.id });
    identities.set(person, user.id);
    if (role === "CUSTOMER") {
      const [profile] = await db
        .insert(customerProfiles)
        .values({
          userId: user.id,
          dateOfBirth: "1995-01-02",
          identityReference: randomUUID(),
          phone: "+1-202-555-0112",
          address: "Fictional Dhaka address",
          verificationStatus: "VERIFIED",
          pinHash,
        })
        .returning({ id: customerProfiles.id });
      profiles.set(person, profile.id);
    }
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: address(person), password })
      .expect(200);
    const cookie: unknown = login.headers["set-cookie"]?.[0];
    if (typeof cookie !== "string")
      throw new Error("Expected an authenticated cookie.");
    cookies.set(person, cookie.split(";")[0]);
  }
  for (const person of ["owner", "owner", "neighbor"] as const) {
    const [account] = await db
      .insert(bankAccounts)
      .values({
        customerId: profiles.get(person)!,
        creationKey: randomUUID(),
        type: "SAVINGS",
        status: "ACTIVE",
      })
      .returning();
    accounts.push(account);
  }
  [source, ownedRecipient, otherRecipient] = accounts;
}, 20_000);

beforeEach(async () => {
  await db
    .delete(transactions)
    .where(inArray(transactions.initiatedBy, [...identities.values()]));
  await db
    .delete(authAttempts)
    .where(inArray(authAttempts.subject, [...identities.values()]));
  await db
    .update(customerProfiles)
    .set({ pinHash })
    .where(inArray(customerProfiles.id, [...profiles.values()]));
  await db
    .update(users)
    .set({ blocked: false })
    .where(inArray(users.id, [...identities.values()]));
  await db
    .update(bankAccounts)
    .set({
      status: "ACTIVE",
      balancePoisha: 30_000n,
      transferLimitPoisha: source.transferLimitPoisha,
      dailyTransferLimitPoisha: source.dailyTransferLimitPoisha,
    })
    .where(
      inArray(
        bankAccounts.id,
        accounts.map(({ id }) => id),
      ),
    );
});

afterAll(async () => {
  try {
    if (identities.size) {
      await db
        .delete(transactions)
        .where(inArray(transactions.initiatedBy, [...identities.values()]));
      await db.delete(bankAccounts).where(
        inArray(
          bankAccounts.id,
          accounts.map(({ id }) => id),
        ),
      );
      await db
        .delete(authAttempts)
        .where(
          inArray(authAttempts.subject, [
            ...identities.values(),
            ...people.map((person) => authDigest("login", address(person))),
          ]),
        );
      await db.delete(users).where(inArray(users.id, [...identities.values()]));
    }
  } finally {
    await db?.$client.end();
    vi.unstubAllEnvs();
  }
});

it("enforces transaction shape and uniqueness in PostgreSQL", async () => {
  const record = {
    senderAccountId: source.id,
    receiverAccountId: otherRecipient.id,
    type: "FUND_TRANSFER",
    status: "COMPLETED",
    amountPoisha: 100n,
    feePoisha: 1_000n,
    description: "Fictional schema fixture",
    initiatedBy: identities.get("owner"),
    idempotencyKey: randomUUID(),
  } as const;
  const [saved] = await db.insert(transactions).values(record).returning();
  await expect(
    db
      .update(transactions)
      .set({ reference: randomUUID() })
      .where(eq(transactions.id, saved.id)),
  ).rejects.toMatchObject({
    cause: { constraint: "transactions_immutable_reference" },
  });
  await expect(db.insert(transactions).values(record)).rejects.toMatchObject({
    cause: { constraint: "transactions_initiator_idempotency_key" },
  });
  await expect(
    db.insert(transactions).values({
      ...record,
      reference: saved.reference,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toMatchObject({
    cause: { constraint: "transactions_reference_unique" },
  });
  const invalid = [
    [{ amountPoisha: 0n }, "transactions_positive_amount"],
    [{ feePoisha: -1n }, "transactions_nonnegative_fee"],
    [{ receiverAccountId: source.id }, "transactions_account_direction"],
    [{ idempotencyKey: null }, "transactions_transfer_identity"],
    [
      { receiverAccountId: randomUUID() },
      "transactions_receiver_account_id_bank_accounts_id_fk",
    ],
  ] as const;
  for (const [change, constraint] of invalid) {
    await expect(
      db
        .insert(transactions)
        .values({ ...record, idempotencyKey: randomUUID(), ...change }),
    ).rejects.toMatchObject({ cause: { constraint } });
  }
});

it("enforces authentication, role, origin, ownership and strict inputs", async () => {
  await request(app)
    .post(prefix)
    .set("Origin", origin)
    .send(payload())
    .expect(401);
  await post(payload(), "staff").expect(403);
  await post(payload(), "admin").expect(403);
  await post(payload()).set("Origin", "https://example.invalid").expect(403);
  await post(payload({ amountPoisha: "0" })).expect(400);
  await post(payload({ amountPoisha: 100 })).expect(400);
  await post(payload({ feePoisha: "0" })).expect(400);
  await post(payload({ sourceAccountId: otherRecipient.id })).expect(404);
  await post(payload({ recipientAccountNumber: "999999999999" })).expect(404);
  await post(payload({ recipientAccountNumber: source.accountNumber })).expect(
    422,
  );
  expect(await postings()).toHaveLength(0);
});

it("provisions and changes a PIN using credentials, storing only its hash", async () => {
  const ownerProfile = eq(customerProfiles.id, profiles.get("owner")!);
  await db.update(customerProfiles).set({ pinHash: null }).where(ownerProfile);
  await changePin({ password, newPin: pin }, "admin").expect(403);
  await changePin({ password, newPin: pin })
    .set("Origin", "https://example.invalid")
    .expect(403);
  await changePin({ password, newPin: "abc123" }).expect(400);
  await changePin({ password: "incorrect", newPin: pin }).expect(403);
  await changePin({ password, newPin: pin }).expect(204);
  const nextPin = "284713";
  await changePin({ password, newPin: nextPin }).expect(403);
  await changePin({ password, currentPin: pin, newPin: nextPin }).expect(204);
  const [profile] = await db
    .select({ hash: customerProfiles.pinHash })
    .from(customerProfiles)
    .where(ownerProfile);
  expect(profile.hash).toMatch(/^scrypt:/);
  expect(await verifyCredential(nextPin, profile.hash)).toBe(true);
  await post(payload()).expect(403);
  await post(payload({ pin: nextPin })).expect(201);
}, 15_000);

it("limits repeated wrong PINs before a transfer can post", async () => {
  const wrong = () => post(payload({ pin: "000000" }));
  const responses = await Promise.all(Array.from({ length: 5 }, wrong));
  expect(responses.map((result) => result.body.error.code)).toEqual(
    Array(5).fill("INVALID_PIN"),
  );
  await post(payload()).expect(429);
  expect(await postings()).toHaveLength(0);
  await expectBalances([30_000n, 30_000n, 30_000n]);
}, 15_000);

it("posts own-account transfers for free and records the cross-customer fee once", async () => {
  const own = await post(
    payload({ recipientAccountNumber: ownedRecipient.accountNumber }),
  ).expect(201);
  const other = await post(payload()).expect(201);
  expect(own.body.transfer).toMatchObject({
    amountPoisha: "10000",
    feePoisha: "0",
    totalDebitPoisha: "10000",
    status: "COMPLETED",
  });
  expect(other.body.transfer).toMatchObject({
    amountPoisha: "10000",
    feePoisha: "1000",
    totalDebitPoisha: "11000",
    status: "COMPLETED",
  });
  expect(own.body.transfer.reference).not.toBe(other.body.transfer.reference);
  expect(await postings()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        senderAccountId: source.id,
        receiverAccountId: ownedRecipient.id,
        feePoisha: 0n,
      }),
      expect.objectContaining({
        senderAccountId: source.id,
        receiverAccountId: otherRecipient.id,
        feePoisha: 1_000n,
      }),
    ]),
  );
  await expectBalances([9_000n, 40_000n, 40_000n]);
});

it.each(["sender", "recipient"] as const)(
  "rejects a frozen %s without posting or updating balances",
  async (side) => {
    const frozen = side === "sender" ? source : otherRecipient;
    await db
      .update(bankAccounts)
      .set({ status: "FROZEN" })
      .where(eq(bankAccounts.id, frozen.id));
    const input = payload();
    const rejected = await post(input).expect(409);
    expect(rejected.body.error.code).toBe("ACCOUNT_RESTRICTED");
    await recover(input.idempotencyKey).expect(404);
    expect(await postings()).toHaveLength(0);
    await expectBalances([30_000n, 30_000n, 30_000n]);
  },
);

it("rejects restrictions, insufficient fee-inclusive balance and recipient overflow", async () => {
  const changeAccount = (
    account: Account,
    values: Partial<typeof bankAccounts.$inferInsert>,
  ) =>
    db.update(bankAccounts).set(values).where(eq(bankAccounts.id, account.id));
  await changeAccount(source, { balancePoisha: 10_000n });
  await changeAccount(otherRecipient, { status: "DEACTIVATED" });
  await post(payload()).expect(409);
  await changeAccount(otherRecipient, { status: "ACTIVE" });
  await db
    .update(users)
    .set({ blocked: true })
    .where(eq(users.id, identities.get("neighbor")!));
  await post(payload()).expect(409);
  await db
    .update(users)
    .set({ blocked: false })
    .where(eq(users.id, identities.get("neighbor")!));
  expect((await post(payload()).expect(422)).body.error.code).toBe(
    "INSUFFICIENT_FUNDS",
  );
  await changeAccount(source, {
    balancePoisha: 30_000n,
    heldBalancePoisha: 20_000n,
  });
  expect((await post(payload()).expect(422)).body.error.code).toBe(
    "INSUFFICIENT_FUNDS",
  );
  await changeAccount(source, { heldBalancePoisha: 0n });
  await changeAccount(otherRecipient, { balancePoisha: maxPoisha });
  expect((await post(payload()).expect(422)).body.error.code).toBe(
    "RECIPIENT_BALANCE_LIMIT",
  );
  expect(await postings()).toHaveLength(0);
  await expectBalances([30_000n, 30_000n, maxPoisha]);
});

it("applies account limits to completed outgoing principal in the Dhaka calendar day", async () => {
  expect(source.transferLimitPoisha).toBe(5_000_000n);
  expect(source.dailyTransferLimitPoisha).toBe(20_000_000n);
  await db
    .update(bankAccounts)
    .set({ transferLimitPoisha: 10_000n, dailyTransferLimitPoisha: 15_000n })
    .where(eq(bankAccounts.id, source.id));
  expect(
    (await post(payload({ amountPoisha: "10001" })).expect(422)).body.error
      .code,
  ).toBe("TRANSFER_LIMIT_EXCEEDED");
  const midnight = new Date(`${dhakaDate(new Date())}T00:00:00+06:00`);
  const historical = {
    senderAccountId: source.id,
    receiverAccountId: otherRecipient.id,
    type: "FUND_TRANSFER",
    status: "COMPLETED",
    amountPoisha: 10_000n,
    feePoisha: 1_000n,
    description: "Fictional historical transfer",
    initiatedBy: identities.get("owner"),
  } as const;
  await db.insert(transactions).values([
    {
      ...historical,
      idempotencyKey: randomUUID(),
      createdAt: new Date(midnight.getTime() - 1),
    },
    {
      ...historical,
      amountPoisha: 5_000n,
      idempotencyKey: randomUUID(),
      createdAt: midnight,
    },
    {
      ...historical,
      status: "FAILED",
      idempotencyKey: randomUUID(),
      createdAt: midnight,
    },
    {
      ...historical,
      senderAccountId: otherRecipient.id,
      receiverAccountId: source.id,
      idempotencyKey: randomUUID(),
      createdAt: midnight,
    },
  ]);
  await post(payload()).expect(201);
  expect(
    (await post(payload({ amountPoisha: "1" })).expect(422)).body.error.code,
  ).toBe("DAILY_TRANSFER_LIMIT_EXCEEDED");
});

it("replays a committed key after timeout, scopes lookup and rejects changed payloads", async () => {
  const input = payload();
  await recover(input.idempotencyKey).expect(404);
  const first = await post(input).expect(201);
  const fallback = await recover(input.idempotencyKey).expect(200);
  expect(fallback.body).toEqual(first.body);
  await recover(input.idempotencyKey, "neighbor").expect(404);
  await recover(input.idempotencyKey, "staff").expect(403);
  const replayed = await post({
    ...input,
    amountPoisha: "010000",
    description: " Fictional transfer ",
  }).expect(200);
  expect(replayed.body).toEqual(first.body);
  expect(
    (await post({ ...input, description: "Changed" }).expect(409)).body.error
      .code,
  ).toBe("IDEMPOTENCY_CONFLICT");
  expect(await postings()).toHaveLength(1);
  await expectBalances([19_000n, 30_000n, 40_000n]);
});

it("posts simultaneous copies of the same request only once", async () => {
  const input = payload();
  const results = await Promise.all([post(input), post(input)]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 201]);
  expect(results[0].body).toEqual(results[1].body);
  expect(await postings()).toHaveLength(1);
  await expectBalances([19_000n, 30_000n, 40_000n]);
});

it("rejects racing reuse of a key with a different source", async () => {
  const input = payload();
  const results = await Promise.all([
    post(input),
    post({ ...input, sourceAccountId: ownedRecipient.id }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  expect(results.find((result) => result.status === 409)?.body.error.code).toBe(
    "IDEMPOTENCY_CONFLICT",
  );
  expect(await postings()).toHaveLength(1);
  const result = await recover(input.idempotencyKey).expect(200);
  expect(result.body).toEqual(
    results.find((response) => response.status === 201)?.body,
  );
});

it("serializes competing debits and competing daily-limit usage", async () => {
  const competing = () =>
    Promise.all([
      post(payload({ amountPoisha: "20000" })),
      post(
        payload({
          amountPoisha: "20000",
          recipientAccountNumber: ownedRecipient.accountNumber,
        }),
      ),
    ]);
  const overdraft = await competing();
  expect(overdraft.map((result) => result.status).sort()).toEqual([201, 422]);
  expect(
    overdraft.find((result) => result.status === 422)?.body.error.code,
  ).toBe("INSUFFICIENT_FUNDS");
  expect(await postings()).toHaveLength(1);
  const sameOwnerWon =
    overdraft.find((result) => result.status === 201)?.body.transfer
      .recipientAccountNumber === ownedRecipient.accountNumber;
  await expectBalances(
    sameOwnerWon ? [10_000n, 50_000n, 30_000n] : [9_000n, 30_000n, 50_000n],
  );
  await db
    .update(bankAccounts)
    .set({ balancePoisha: 100_000n, dailyTransferLimitPoisha: 40_000n })
    .where(eq(bankAccounts.id, source.id));
  const daily = await competing();
  expect(daily.map((result) => result.status).sort()).toEqual([201, 422]);
  expect(daily.find((result) => result.status === 422)?.body.error.code).toBe(
    "DAILY_TRANSFER_LIMIT_EXCEEDED",
  );
  expect(await postings()).toHaveLength(2);
});

it("locks both accounts in a stable order for opposite-direction transfers", async () => {
  const results = await Promise.all([
    post(payload()),
    post(
      payload({
        sourceAccountId: otherRecipient.id,
        recipientAccountNumber: source.accountNumber,
      }),
      "neighbor",
    ),
  ]);
  expect(results.map((result) => result.status)).toEqual([201, 201]);
  await expectBalances([29_000n, 30_000n, 29_000n]);
});

it("rolls back a failed insert and safely posts a retry with the same key", async () => {
  const input = payload({ description: "test-only forced insert failure" });
  await db.execute(sql`alter table transactions add constraint transfer_test_reject_insert
    check (description <> 'test-only forced insert failure') not valid`);
  try {
    await post(input).expect(500);
    await recover(input.idempotencyKey).expect(404);
    expect(await postings()).toHaveLength(0);
    await expectBalances([30_000n, 30_000n, 30_000n]);
  } finally {
    await db.execute(
      sql`alter table transactions drop constraint transfer_test_reject_insert`,
    );
  }
  const result = await post(input).expect(201);
  const replay = await post(input).expect(200);
  expect(replay.body).toEqual(result.body);
  expect(await postings()).toHaveLength(1);
  await expectBalances([19_000n, 30_000n, 40_000n]);
});

it("quotes current terms without posting or exposing owner information", async () => {
  const quote = (recipientAccountNumber: string, sourceAccountId = source.id) =>
    request(app)
      .post(`${prefix}/quote`)
      .set("Origin", origin)
      .set("Cookie", cookies.get("owner")!)
      .send({ sourceAccountId, recipientAccountNumber, amountPoisha: "10000" });
  const cross = await quote(otherRecipient.accountNumber).expect(200);
  expect(cross.body.quote).toEqual({
    sourceAccountNumber: source.accountNumber,
    recipientAccountNumber: otherRecipient.accountNumber,
    amountPoisha: "10000",
    feePoisha: "1000",
    totalDebitPoisha: "11000",
  });
  expect(
    (await quote(ownedRecipient.accountNumber).expect(200)).body.quote
      .totalDebitPoisha,
  ).toBe("10000");
  await quote(ownedRecipient.accountNumber, otherRecipient.id).expect(404);
  await db
    .update(bankAccounts)
    .set({ status: "FROZEN" })
    .where(eq(bankAccounts.id, otherRecipient.id));
  await quote(otherRecipient.accountNumber).expect(409);
  await expectBalances([30_000n, 30_000n, 30_000n]);
  expect(await postings()).toHaveLength(0);

  const pinStatus = () =>
    request(app)
      .get("/api/v1/auth/transaction-pin")
      .set("Cookie", cookies.get("owner")!);
  await pinStatus().expect(200, { configured: true });
  await db
    .update(customerProfiles)
    .set({ pinHash: null })
    .where(eq(customerProfiles.id, profiles.get("owner")!));
  await pinStatus().expect(200, { configured: false });
});

const historyPath = "/api/v1/transactions";
function historyRequest(person: Person, path = "") {
  return request(app)
    .get(historyPath + path)
    .set("Cookie", cookies.get(person)!);
}

it("shows one committed row to both participants and scopes details and receipts", async () => {
  await request(app).get(historyPath).expect(401);
  const other = (await post(payload()).expect(201)).body.transfer
    .reference as string;
  const own = (
    await post(
      payload({ recipientAccountNumber: ownedRecipient.accountNumber }),
    ).expect(201)
  ).body.transfer.reference as string;
  const outgoing = await historyRequest("owner")
    .query({ reference: other })
    .expect(200);
  expect(outgoing.body.transactions).toEqual([
    expect.objectContaining({ reference: other, direction: "OUTGOING" }),
  ]);
  const incoming = await historyRequest("neighbor").expect(200);
  expect(incoming.body.transactions).toEqual([
    expect.objectContaining({ reference: other, direction: "INCOMING" }),
  ]);
  await historyRequest("neighbor", `/${own}`).expect(404);
  await historyRequest("neighbor", `/${own}/receipt`).expect(404);
  const detail = (await historyRequest("owner", `/${own}`).expect(200)).body
    .transaction;
  expect(detail).toEqual(
    expect.objectContaining({ reference: own, direction: "INTERNAL" }),
  );
  for (const person of ["admin", "staff"] as const) {
    const scoped = await historyRequest(person)
      .query({ reference: own })
      .expect(200);
    expect(scoped.body.transactions).toEqual([
      expect.objectContaining({ reference: own, direction: null }),
    ]);
    const receipt = await historyRequest(person, `/${own}/receipt`).expect(200);
    expect(receipt.body.transaction).toEqual({ ...detail, direction: null });
    expect(receipt.headers["cache-control"]).toBe("no-store");
  }
  const receipt = await historyRequest("neighbor", `/${other}/receipt`).expect(
    200,
  );
  expect(receipt.body.transaction).toEqual(incoming.body.transactions[0]);
  expect(receipt.body.transaction).not.toHaveProperty("initiatedBy");
  expect(receipt.body.transaction).not.toHaveProperty("idempotencyKey");
});

it("lets Admin view one customer's transaction history across their accounts", async () => {
  const cross = (await post(payload()).expect(201)).body.transfer.reference;
  const internal = (
    await post(
      payload({ recipientAccountNumber: ownedRecipient.accountNumber }),
    ).expect(201)
  ).body.transfer.reference;
  const ownerId = profiles.get("owner")!;
  const neighborId = profiles.get("neighbor")!;

  const owner = await historyRequest("admin")
    .query({ customerId: ownerId })
    .expect(200);
  expect(
    owner.body.transactions.map((row: { reference: string }) => row.reference),
  ).toEqual([internal, cross]);
  const neighbor = await historyRequest("admin")
    .query({ customerId: neighborId })
    .expect(200);
  expect(neighbor.body.transactions).toEqual([
    expect.objectContaining({ reference: cross }),
  ]);
  const empty = await historyRequest("admin")
    .query({ customerId: neighborId, reference: internal })
    .expect(200);
  expect(empty.body).toEqual({ transactions: [], hasNextPage: false });
  for (const person of ["staff", "owner"] as const) {
    await historyRequest(person).query({ customerId: ownerId }).expect(403);
  }
  await historyRequest("admin").query({ customerId: "invalid" }).expect(400);
});

it("filters status, type, Dhaka dates and references with stable pagination", async () => {
  const reference = randomUUID();
  const base = {
    receiverAccountId: source.id,
    type: "DEPOSIT",
    status: "COMPLETED",
    amountPoisha: 100n,
    description: "Fictional record",
    initiatedBy: identities.get("owner"),
    createdAt: new Date("2026-06-01T18:00:00Z"),
  } as const;
  await db.insert(transactions).values([
    ...Array.from({ length: 21 }, () => base),
    {
      ...base,
      status: "FAILED" as const,
      reference,
      createdAt: new Date("2026-06-01T17:59:59.999Z"),
    },
    {
      ...base,
      type: "LOAN_DISBURSEMENT" as const,
      status: "REVERSED" as const,
    },
    { ...base, status: "PENDING" as const },
  ]);
  const filters = {
    from: "2026-06-02",
    to: "2026-06-02",
    type: "DEPOSIT",
    status: "COMPLETED",
  };
  const first = (await historyRequest("owner").query(filters).expect(200)).body;
  const second = (
    await historyRequest("owner")
      .query({ ...filters, page: 2 })
      .expect(200)
  ).body;
  expect(first.transactions).toHaveLength(20);
  expect(first.hasNextPage).toBe(true);
  expect(second.transactions).toHaveLength(1);
  expect(second.hasNextPage).toBe(false);
  expect(
    first.transactions.map((row: { reference: string }) => row.reference),
  ).not.toContain(second.transactions[0].reference);
  const prefixMatch = await historyRequest("owner")
    .query({
      reference: reference.slice(0, 12).toUpperCase(),
      to: "2026-06-01",
    })
    .expect(200);
  expect(prefixMatch.body.transactions).toEqual([
    expect.objectContaining({ reference, status: "FAILED" }),
  ]);
  await historyRequest("owner", `/${reference}`).expect(200);
  await historyRequest("owner", `/${reference}/receipt`).expect(404);
  await historyRequest("owner")
    .query({ from: "2026-06-03", to: "2026-06-02" })
    .expect(400);
});

function reverse(
  reference: string,
  person: Person = "admin",
  reason = "Duplicate payment",
) {
  return request(app)
    .post(`/api/v1/transactions/${reference}/reverse`)
    .set("Cookie", cookies.get(person)!)
    .set("Origin", origin)
    .send({ reason });
}

it("reverses a transfer once and preserves linked receipts and both statement entries", async () => {
  const input = payload();
  const created = await post(input).expect(201);
  const { reference } = created.body.transfer;
  await reverse(reference, "staff").expect(403);
  await reverse(reference, "owner").expect(403);
  await reverse(reference).set("Origin", "https://example.invalid").expect(403);
  await reverse(reference, "admin", "  ").expect(400);

  const outcomes = await Promise.all([reverse(reference), reverse(reference)]);
  expect(outcomes.map(({ status }) => status).sort()).toEqual([201, 409]);
  const { reversalReference } = outcomes.find(
    ({ status }) => status === 201,
  )!.body;
  await expectBalances([30_000n, 30_000n, 30_000n]);
  const rows = await postings();
  const original = rows.find((row) => row.reference === reference)!;
  expect(original).toMatchObject({
    status: "REVERSED",
    amountPoisha: 10_000n,
    feePoisha: 1_000n,
    description: input.description,
  });
  expect(rows.find((row) => row.reference === reversalReference)).toMatchObject(
    {
      type: "TRANSFER_REVERSAL",
      status: "COMPLETED",
      reversesTransactionId: original.id,
      senderAccountId: otherRecipient.id,
      receiverAccountId: source.id,
      amountPoisha: 10_000n,
      feePoisha: 0n,
      refundedFeePoisha: 1_000n,
      reversalReason: "Duplicate payment",
      initiatedBy: identities.get("admin"),
    },
  );
  expect(rows).toHaveLength(2);
  await reverse(reversalReference).expect(409);
  const replay = await post(input).expect(200);
  expect(replay.body.transfer.status).toBe("REVERSED");
  await expectBalances([30_000n, 30_000n, 30_000n]);

  const originalReceipt = await request(app)
    .get(`/api/v1/transactions/${reference}/receipt`)
    .set("Cookie", cookies.get("owner")!)
    .expect(200);
  expect(originalReceipt.body.transaction).toMatchObject({
    status: "REVERSED",
    reversalReference,
  });
  const reversalReceipt = await request(app)
    .get(`/api/v1/transactions/${reversalReference}/receipt`)
    .set("Cookie", cookies.get("owner")!)
    .expect(200);
  expect(reversalReceipt.body.transaction).toMatchObject({
    originalReference: reference,
    refundedFeePoisha: "1000",
  });
  expect(reversalReceipt.body.transaction).not.toHaveProperty("reversalReason");

  const day = dhakaDate(new Date());
  const statement = await request(app)
    .get(`/api/v1/accounts/${source.id}/statement`)
    .query({ from: day, to: day })
    .set("Cookie", cookies.get("owner")!)
    .expect(200);
  expect(statement.text).toContain(
    '"FUND_TRANSFER","Debit","100.00","10.00","110.00","0.00"',
  );
  expect(statement.text).toContain(
    '"TRANSFER_REVERSAL","Credit","100.00","0.00","0.00","110.00"',
  );
});

it("rejects restricted or unfunded reversals and rolls back a failed posting", async () => {
  const completed = await post(payload()).expect(201);
  const { reference } = completed.body.transfer;
  const recipient = eq(bankAccounts.id, otherRecipient.id);
  const sender = eq(bankAccounts.id, source.id);
  await db.update(bankAccounts).set({ status: "FROZEN" }).where(recipient);
  await reverse(reference).expect(409);
  await db
    .update(bankAccounts)
    .set({ status: "ACTIVE", heldBalancePoisha: 35_000n })
    .where(recipient);
  const insufficient = await reverse(reference).expect(422);
  expect(insufficient.body.error.code).toBe("INSUFFICIENT_FUNDS");
  await db.update(bankAccounts).set({ heldBalancePoisha: 0n }).where(recipient);
  await db.update(bankAccounts).set({ balancePoisha: maxPoisha }).where(sender);
  const overflow = await reverse(reference).expect(422);
  expect(overflow.body.error.code).toBe("ACCOUNT_BALANCE_LIMIT");
  await db.update(bankAccounts).set({ balancePoisha: 19_000n }).where(sender);

  await db.execute(sql`alter table transactions add constraint transfer_test_reject_reversal
    check (reversal_reason is distinct from 'Forced reversal rollback')`);
  try {
    await reverse(reference, "admin", "Forced reversal rollback").expect(500);
    await expectBalances([19_000n, 30_000n, 40_000n]);
    expect(await postings()).toMatchObject([
      { reference, status: "COMPLETED" },
    ]);
  } finally {
    await db.execute(
      sql`alter table transactions drop constraint transfer_test_reject_reversal`,
    );
  }
  await reverse(reference).expect(201);
  await expectBalances([30_000n, 30_000n, 30_000n]);
});

it("downloads PDF receipts only for posted transactions within the caller's scope", async () => {
  const result = await post(payload()).expect(201);
  const { reference } = result.body.transfer;
  const pdf = `/${reference}/receipt.pdf`;
  await request(app)
    .get(historyPath + pdf)
    .expect(401);
  const pending = await db
    .insert(transactions)
    .values({
      type: "DEPOSIT",
      status: "PENDING",
      receiverAccountId: source.id,
      amountPoisha: 100n,
      description: "Pending fixture",
      initiatedBy: identities.get("admin"),
    })
    .returning({ reference: transactions.reference });
  await historyRequest("owner", `/${pending[0].reference}/receipt.pdf`).expect(
    404,
  );
  const own = (
    await post(
      payload({ recipientAccountNumber: ownedRecipient.accountNumber }),
    ).expect(201)
  ).body.transfer.reference;
  await historyRequest("neighbor", `/${own}/receipt.pdf`).expect(404);
  for (const role of ["owner", "neighbor", "staff", "admin"] as const) {
    const response = await historyRequest(role, pdf)
      .expect(200)
      .expect("Cache-Control", "no-store")
      .expect("Content-Type", /^application\/pdf/)
      .expect(
        "Content-Disposition",
        new RegExp(
          `attachment; filename="?bankbolt-receipt-${reference}\\.pdf"?`,
        ),
      );
    const file = (response.body as Buffer).toString("latin1");
    expect(file).toMatch(/^%PDF-/);
    expect(file).toMatch(/%%EOF\s*$/);
    expect(file.match(/\/Type \/Page\b/g)).toHaveLength(1);
  }
});
