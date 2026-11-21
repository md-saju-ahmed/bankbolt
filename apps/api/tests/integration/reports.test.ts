import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import app from "../../src/app.ts";
import { getDatabase } from "../../src/db/client.ts";
import {
  authAttempts,
  bankAccounts,
  cashRequests,
  customerProfiles,
  loans,
  transactionFlags,
  transactions,
  users,
} from "../../src/db/schema.ts";
import { dhakaDate } from "../../src/lib/dhaka-date.ts";
import { authDigest } from "../../src/modules/auth/auth-config.ts";
import { hashCredential } from "../../src/modules/auth/credentials.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

const origin = "http://localhost:3000";
const prefix = "/api/v1/reports";
const period = { from: "2041-12-31", to: "2042-02-01" };
const start = new Date("2041-12-30T18:00:00.000Z");
const closingMonth = new Date("2042-01-31T18:00:00.000Z");
const beforeStart = new Date(start.getTime() - 1);
const afterEnd = new Date("2042-02-01T18:00:00.000Z");
const largeBalance = 9_223_372_036_854_775_000n;
const largeDeposit = 9_007_199_254_740_993n;
const run = randomUUID();
const roles = {
  owner: "CUSTOMER",
  other: "CUSTOMER",
  empty: "CUSTOMER",
  admin: "ADMIN",
  staff: "STAFF",
  otherStaff: "STAFF",
} as const;
type Person = keyof typeof roles;
const people = Object.keys(roles) as Person[];
const email = (person: Person) =>
  `reports-${person.toLowerCase()}-${run}@bankbolt.example`;
const userIds = new Map<Person, string>();
const profileIds = new Map<Person, string>();
const cookies = new Map<Person, string>();
const accountIds: string[] = [];
const transactionIds: string[] = [];
let db: ReturnType<typeof getDatabase>;
let registeredCustomersBeforeFixtures: number;
let baselineAdmin: {
  summary: {
    accountCount: number;
    balancePoisha: string;
    pendingLoanApplications: number;
    openTransactionFlags: number;
  };
  accountDistribution: { type: string; count: number }[];
};
let baselineStaff: {
  pendingCashRequests: { deposits: number; withdrawals: number; total: number };
  loanReview: {
    pending: number;
    underReview: number;
    forwarded: number;
    actionable: number;
  };
  openTransactionFlags: number;
};

function report(
  person: Person,
  path: "admin" | "staff" | "customer",
  query = {},
) {
  return request(app)
    .get(`${prefix}/${path}`)
    .set("Cookie", cookies.get(person)!)
    .query(query);
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
  registeredCustomersBeforeFixtures = await db.$count(
    users,
    eq(users.role, "CUSTOMER"),
  );
  const password = "Fictional reporting test password";
  const passwordHash = await hashCredential(password);
  for (const person of people) {
    const role = roles[person];
    const [user] = await db
      .insert(users)
      .values({
        email: email(person),
        fullName: `Fictional report ${person}`,
        role,
        passwordHash,
      })
      .returning({ id: users.id });
    userIds.set(person, user.id);
    if (role === "CUSTOMER") {
      const [profile] = await db
        .insert(customerProfiles)
        .values({
          userId: user.id,
          phone: "+1-202-555-0108",
          dateOfBirth: "1990-01-01",
          address: "Fictional address",
          identityReference: randomUUID(),
        })
        .returning({ id: customerProfiles.id });
      profileIds.set(person, profile.id);
    }
    const session = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: email(person), password })
      .expect(200);
    const cookie: unknown = session.headers["set-cookie"]?.[0];
    if (typeof cookie !== "string")
      throw new Error("Expected a session cookie.");
    cookies.set(person, cookie.split(";")[0]);
  }

  baselineAdmin = (await report("admin", "admin", period).expect(200)).body;
  baselineStaff = (await report("staff", "staff").expect(200)).body;

  const owner = profileIds.get("owner")!;
  const [savings, current, outside] = await db
    .insert(bankAccounts)
    .values([
      {
        customerId: owner,
        type: "SAVINGS",
        status: "ACTIVE",
        balancePoisha: largeBalance,
        creationKey: randomUUID(),
      },
      {
        customerId: owner,
        type: "CURRENT",
        status: "FROZEN",
        balancePoisha: largeBalance,
        creationKey: randomUUID(),
      },
      {
        customerId: profileIds.get("other")!,
        type: "SAVINGS",
        status: "ACTIVE",
        balancePoisha: 1000n,
        creationKey: randomUUID(),
      },
    ])
    .returning({ id: bankAccounts.id });
  accountIds.push(savings.id, current.id, outside.id);

  const loan = {
    customerId: owner,
    disbursementAccountId: savings.id,
    type: "PERSONAL",
    requestedPrincipalPoisha: 1_000_000n,
    termMonths: 6,
    monthlyIncomePoisha: 1_000_000n,
    employmentStatus: "Employed",
    description: "Fictional loan",
  } as const;
  const approved = {
    approvedPrincipalPoisha: 1_000_000n,
    decidedBy: userIds.get("admin"),
    decidedAt: start,
  };
  const [activeLoan] = await db
    .insert(loans)
    .values([
      {
        ...loan,
        ...approved,
        status: "ACTIVE",
        remainingPrincipalPoisha: 998_500n,
        disbursedAt: start,
      },
      {
        ...loan,
        ...approved,
        status: "COMPLETED",
        remainingPrincipalPoisha: 0n,
        disbursedAt: start,
        completedAt: closingMonth,
      },
      { ...loan, ...approved, status: "APPROVED", decidedAt: beforeStart },
      { ...loan, ...approved, status: "APPROVED" },
      {
        ...loan,
        status: "REJECTED",
        decidedAt: closingMonth,
        decidedBy: userIds.get("admin"),
        rejectionReason: "Fictional example",
      },
      loan,
      { ...loan, status: "UNDER_REVIEW", reviewStartedAt: start },
      {
        ...loan,
        status: "UNDER_REVIEW",
        reviewStartedAt: start,
        forwardedAt: start,
        forwardedBy: userIds.get("staff"),
      },
    ])
    .returning({ id: loans.id });

  const posted = {
    status: "COMPLETED",
    description: "Fictional reporting activity",
  } as const;
  const transfer = (
    source: string,
    target: string,
    amountPoisha: bigint,
    feePoisha: bigint,
    createdAt: Date,
  ) => ({
    ...posted,
    type: "FUND_TRANSFER" as const,
    senderAccountId: source,
    receiverAccountId: target,
    amountPoisha,
    feePoisha,
    createdAt,
    idempotencyKey: randomUUID(),
    initiatedBy: userIds.get(source === outside.id ? "other" : "owner"),
  });
  const activity = await db
    .insert(transactions)
    .values([
      {
        ...posted,
        type: "DEPOSIT",
        receiverAccountId: savings.id,
        amountPoisha: 10_000n,
        createdAt: start,
      },
      transfer(savings.id, current.id, 5_000n, 0n, start),
      {
        ...posted,
        type: "LOAN_DISBURSEMENT",
        receiverAccountId: savings.id,
        amountPoisha: 1_000_000n,
        loanId: activeLoan.id,
        createdAt: start,
      },
      transfer(savings.id, outside.id, 9_000n, 1000n, closingMonth),
      transfer(outside.id, current.id, 7_000n, 1000n, closingMonth),
      {
        ...posted,
        type: "WITHDRAWAL",
        senderAccountId: current.id,
        amountPoisha: 2_000n,
        createdAt: closingMonth,
      },
      {
        ...posted,
        type: "LOAN_REPAYMENT",
        senderAccountId: current.id,
        amountPoisha: 1725n,
        loanId: activeLoan.id,
        createdAt: closingMonth,
      },
      {
        ...posted,
        type: "DEPOSIT",
        receiverAccountId: outside.id,
        amountPoisha: largeDeposit,
        createdAt: new Date(closingMonth.getTime() + 100),
      },
      {
        ...posted,
        type: "DEPOSIT",
        status: "PENDING",
        receiverAccountId: savings.id,
        amountPoisha: 200_000n,
        createdAt: closingMonth,
      },
      {
        ...posted,
        type: "WITHDRAWAL",
        status: "FAILED",
        senderAccountId: current.id,
        amountPoisha: 200_000n,
        createdAt: closingMonth,
      },
      {
        ...transfer(savings.id, outside.id, 200_000n, 1000n, closingMonth),
        status: "REVERSED",
      },
      {
        ...posted,
        type: "DEPOSIT",
        receiverAccountId: savings.id,
        amountPoisha: 400_000n,
        createdAt: beforeStart,
      },
      {
        ...posted,
        type: "WITHDRAWAL",
        senderAccountId: savings.id,
        amountPoisha: 400_000n,
        createdAt: afterEnd,
      },
    ])
    .returning({ id: transactions.id });
  transactionIds.push(...activity.map(({ id }) => id));

  const cash = {
    accountId: savings.id,
    customerId: owner,
    amountPoisha: 1000n,
    description: "Fictional cash request",
  } as const;
  await db.insert(cashRequests).values([
    { ...cash, type: "DEPOSIT" },
    { ...cash, type: "WITHDRAWAL" },
    {
      ...cash,
      type: "DEPOSIT",
      status: "APPROVED",
      reviewedBy: userIds.get("staff"),
      reviewedAt: start,
    },
  ]);
  await db.insert(transactionFlags).values([
    {
      transactionId: activity[0].id,
      flaggedBy: userIds.get("staff")!,
      reason: "Fictional open flag",
    },
    {
      transactionId: activity[1].id,
      flaggedBy: userIds.get("staff")!,
      reason: "Fictional resolved flag",
      resolvedAt: closingMonth,
      resolvedBy: userIds.get("admin")!,
      resolutionNote: "Fictional resolution",
    },
    {
      transactionId: activity[2].id,
      flaggedBy: userIds.get("otherStaff")!,
      reason: "Fictional flag from another staff member",
    },
  ]);
}, 20_000);

afterAll(async () => {
  try {
    if (!db) return;
    if (transactionIds.length) {
      await db
        .delete(transactionFlags)
        .where(inArray(transactionFlags.transactionId, transactionIds));
      await db
        .delete(transactions)
        .where(inArray(transactions.id, transactionIds));
    }
    if (profileIds.size) {
      await db
        .delete(loans)
        .where(inArray(loans.customerId, [...profileIds.values()]));
      await db
        .delete(cashRequests)
        .where(inArray(cashRequests.customerId, [...profileIds.values()]));
    }
    if (accountIds.length)
      await db.delete(bankAccounts).where(inArray(bankAccounts.id, accountIds));
    await db.delete(authAttempts).where(
      inArray(
        authAttempts.subject,
        people.map((person) => authDigest("login", email(person))),
      ),
    );
    if (userIds.size)
      await db.delete(users).where(inArray(users.id, [...userIds.values()]));
  } finally {
    await db?.$client.end();
    vi.unstubAllEnvs();
  }
});

it("enforces report roles, owner filtering, strict queries and bounded Dhaka periods", async () => {
  await request(app).get(`${prefix}/admin`).expect(401);
  for (const [person, path] of [
    ["owner", "admin"],
    ["staff", "admin"],
    ["owner", "staff"],
    ["admin", "staff"],
    ["admin", "customer"],
    ["staff", "customer"],
  ] as const) {
    await report(person, path).expect(403);
  }
  for (const query of [
    { from: period.from },
    { from: period.to, to: period.from },
    { from: "2041-02-29", to: period.to },
    { from: "2040-01-01", to: period.to },
    { ...period, userId: userIds.get("other") },
    { ...period, accountId: "bad id" },
  ])
    await report("owner", "customer", query).expect(400);
  await report("staff", "staff", period).expect(400);
  await report("owner", "customer", {
    ...period,
    accountId: accountIds[2],
  }).expect(404);
  await report("owner", "customer", {
    ...period,
    accountId: randomUUID(),
  }).expect(404);
  const defaults = await report("empty", "customer").expect(200);
  expect(defaults.headers["cache-control"]).toBe("no-store");
  expect(defaults.body.period.to).toBe(dhakaDate(new Date()));
  expect(defaults.body.monthly).toHaveLength(6);
  expect(defaults.body.summary).toEqual({
    accountCount: 0,
    balancePoisha: "0",
    completedTransactions: 0,
    depositsPoisha: "0",
    withdrawalsPoisha: "0",
    activeLoans: 0,
    outstandingPrincipalPoisha: "0",
  });
  expect(defaults.body.recentTransactions).toEqual([]);
});

it("reports Admin snapshots, monthly completed volume, and decision-date statistics", async () => {
  const { body, headers } = await report("admin", "admin", period).expect(200);
  expect(headers["cache-control"]).toBe("no-store");
  expect(body.period).toEqual({ ...period, timeZone: "Asia/Dhaka" });
  expect(body.summary).toMatchObject({
    accountCount: baselineAdmin.summary.accountCount + 3,
    balancePoisha: (
      BigInt(baselineAdmin.summary.balancePoisha) +
      largeBalance * 2n +
      1000n
    ).toString(),
    pendingLoanApplications: baselineAdmin.summary.pendingLoanApplications + 3,
    openTransactionFlags: baselineAdmin.summary.openTransactionFlags + 2,
    completedTransactions: 8,
    depositsPoisha: (largeDeposit + 10_000n).toString(),
    withdrawalsPoisha: "2000",
  });
  expect(body.summary.customerCount).toBe(
    registeredCustomersBeforeFixtures + 3,
  );
  expect(body.accountDistribution).toEqual(
    baselineAdmin.accountDistribution.map((row) => ({
      ...row,
      count:
        row.count +
        (row.type === "SAVINGS" ? 2 : row.type === "CURRENT" ? 1 : 0),
    })),
  );
  expect(body.transactionStatusCounts).toEqual({
    PENDING: 1,
    COMPLETED: 8,
    FAILED: 1,
    REVERSED: 1,
  });
  expect(body.loanDecisions).toEqual({ approved: 3, rejected: 1 });
  expect(body.monthly).toEqual([
    {
      month: "2041-12",
      completedTransactions: 3,
      transactionVolumePoisha: "1015000",
      depositsPoisha: "10000",
      withdrawalsPoisha: "0",
      transfersPoisha: "5000",
      loanDisbursementsPoisha: "1000000",
      loanRepaymentsPoisha: "0",
    },
    {
      month: "2042-01",
      completedTransactions: 0,
      transactionVolumePoisha: "0",
      depositsPoisha: "0",
      withdrawalsPoisha: "0",
      transfersPoisha: "0",
      loanDisbursementsPoisha: "0",
      loanRepaymentsPoisha: "0",
    },
    {
      month: "2042-02",
      completedTransactions: 5,
      transactionVolumePoisha: (largeDeposit + 19_725n).toString(),
      depositsPoisha: largeDeposit.toString(),
      withdrawalsPoisha: "2000",
      transfersPoisha: "16000",
      loanDisbursementsPoisha: "0",
      loanRepaymentsPoisha: "1725",
    },
  ]);
  const quietMonth = await report("admin", "admin", {
    from: "2042-01-01",
    to: "2042-01-31",
  }).expect(200);
  expect(quietMonth.body.monthly).toEqual([body.monthly[1]]);
  expect(quietMonth.body.summary).toMatchObject({
    completedTransactions: 0,
    balancePoisha: body.summary.balancePoisha,
    pendingLoanApplications: body.summary.pendingLoanApplications,
  });
});

it("counts an owned transfer once, excludes it from spending, and scopes transaction and loan totals by account", async () => {
  const { body } = await report("owner", "customer", period).expect(200);
  expect(body.summary).toEqual({
    accountCount: 2,
    balancePoisha: (largeBalance * 2n).toString(),
    depositsPoisha: "10000",
    withdrawalsPoisha: "2000",
    completedTransactions: 7,
    activeLoans: 1,
    outstandingPrincipalPoisha: "998500",
  });
  expect(body.transactionStatusCounts).toEqual({
    PENDING: 1,
    COMPLETED: 7,
    FAILED: 1,
    REVERSED: 1,
  });
  expect(body.transactionDistribution).toContainEqual({
    type: "FUND_TRANSFER",
    count: 3,
  });
  expect(body.monthly).toEqual([
    { month: "2041-12", spendingPoisha: "0", depositsPoisha: "10000" },
    { month: "2042-01", spendingPoisha: "0", depositsPoisha: "0" },
    { month: "2042-02", spendingPoisha: "13725", depositsPoisha: "0" },
  ]);
  expect(body.recentTransactions).toHaveLength(5);
  expect(
    body.recentTransactions.every(
      (entry: { amountPoisha: string }) =>
        entry.amountPoisha !== largeDeposit.toString(),
    ),
  ).toBe(true);

  const selected = await report("owner", "customer", {
    ...period,
    accountId: accountIds[1],
  }).expect(200);
  expect(selected.body.accountId).toBe(accountIds[1]);
  expect(selected.body.summary).toEqual({
    accountCount: 1,
    balancePoisha: largeBalance.toString(),
    depositsPoisha: "0",
    withdrawalsPoisha: "2000",
    completedTransactions: 4,
    activeLoans: 0,
    outstandingPrincipalPoisha: "0",
  });
  expect(selected.body.monthly[2].spendingPoisha).toBe("3725");
  expect(selected.body.recentTransactions).toContainEqual(
    expect.objectContaining({ amountPoisha: "5000", direction: "INTERNAL" }),
  );
  expect(selected.body.recentTransactions).toContainEqual(
    expect.objectContaining({ amountPoisha: "7000", direction: "INCOMING" }),
  );
  expect(selected.body.recentTransactions).toContainEqual(
    expect.objectContaining({ amountPoisha: "2000", direction: "OUTGOING" }),
  );
});

it("reports pending cash, review work, Admin handoffs and unresolved flags for Staff", async () => {
  const { body, headers } = await report("staff", "staff").expect(200);
  expect(headers["cache-control"]).toBe("no-store");
  expect(body).toEqual({
    pendingCashRequests: {
      deposits: baselineStaff.pendingCashRequests.deposits + 1,
      withdrawals: baselineStaff.pendingCashRequests.withdrawals + 1,
      total: baselineStaff.pendingCashRequests.total + 2,
    },
    loanReview: {
      pending: baselineStaff.loanReview.pending + 1,
      underReview: baselineStaff.loanReview.underReview + 1,
      forwarded: baselineStaff.loanReview.forwarded + 1,
      actionable: baselineStaff.loanReview.actionable + 2,
    },
    openTransactionFlags: baselineStaff.openTransactionFlags + 1,
  });
});

it("links the Staff flag count to an own-only queue and keeps resolution reserved for Admin", async () => {
  const flags = (person: Person, path = "/mine") =>
    request(app)
      .get(`/api/v1/transaction-flags${path}`)
      .set("Cookie", cookies.get(person)!);
  await flags("owner").expect(403);
  await flags("admin").expect(403);
  await flags("staff", "").expect(403);
  await flags("staff")
    .query({ flaggedBy: userIds.get("otherStaff") })
    .expect(400);

  const open = await flags("staff").query({ status: "OPEN" }).expect(200);
  expect(open.headers["cache-control"]).toBe("no-store");
  expect(open.body.flags).toEqual([
    expect.objectContaining({ status: "OPEN", reason: "Fictional open flag" }),
  ]);
  expect(
    (await report("staff", "staff").expect(200)).body.openTransactionFlags,
  ).toBe(open.body.flags.length);
  const resolved = await flags("staff")
    .query({ status: "RESOLVED" })
    .expect(200);
  expect(resolved.body.flags).toEqual([
    expect.objectContaining({
      status: "RESOLVED",
      resolutionNote: "Fictional resolution",
    }),
  ]);
  const other = await flags("otherStaff").query({ status: "OPEN" }).expect(200);
  expect(other.body.flags).toEqual([
    expect.objectContaining({
      status: "OPEN",
      reason: "Fictional flag from another staff member",
    }),
  ]);

  const id = open.body.flags[0].id as string;
  await request(app)
    .post(`/api/v1/transaction-flags/${id}/resolve`)
    .set("Cookie", cookies.get("staff")!)
    .set("Origin", origin)
    .send({})
    .expect(403);
  const admin = await flags("admin", "").query({ status: "OPEN" }).expect(200);
  expect(admin.body.flags).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id }),
      expect.objectContaining({
        reason: "Fictional flag from another staff member",
      }),
    ]),
  );
});
