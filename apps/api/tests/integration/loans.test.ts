import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import app from "../../src/app.ts";
import { getDatabase } from "../../src/db/client.ts";
import {
  authAttempts,
  bankAccounts,
  customerProfiles,
  loanInstallments,
  loanReviewNotes,
  loans,
  transactions,
  users,
} from "../../src/db/schema.ts";
import { authDigest } from "../../src/modules/auth/auth-config.ts";
import { hashCredential } from "../../src/modules/auth/credentials.ts";
import { storeLoanSchedule } from "../../src/modules/loans/service.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

const origin = "http://localhost:3000";
const prefix = "/api/v1/loans";
const password = "Fictional loan test password";
const pin = "514723";
const roles = {
  owner: "CUSTOMER",
  neighbor: "CUSTOMER",
  admin: "ADMIN",
  staff: "STAFF",
} as const;
type Person = keyof typeof roles;
const people = Object.keys(roles) as Person[];
const run = randomUUID();
const address = (person: Person) => `loan-${person}-${run}@bankbolt.example`;
const usersByPerson = new Map<Person, string>();
const cookies = new Map<Person, string>();
const profiles = new Map<Person, string>();
const accounts = new Map<Person, string>();
let db: ReturnType<typeof getDatabase>;

function get(person: Person, path = "") {
  return request(app)
    .get(prefix + path)
    .set("Cookie", cookies.get(person)!);
}

function reviewAction(person: Person, id: string, action: string, input = {}) {
  return request(app)
    .post(`${prefix}/${id}/${action}`)
    .set("Origin", origin)
    .set("Cookie", cookies.get(person)!)
    .send(input);
}

function loanInput(
  person: "owner" | "neighbor" = "owner",
  changes?: Partial<typeof loans.$inferInsert>,
) {
  return {
    type: "PERSONAL",
    customerId: profiles.get(person)!,
    disbursementAccountId: accounts.get(person)!,
    requestedPrincipalPoisha: 1_000_000n,
    termMonths: 6,
    monthlyIncomePoisha: 5_000_000n,
    employmentStatus: "Employed",
    description: "Fictional loan application",
    ...changes,
  } satisfies typeof loans.$inferInsert;
}

async function approvedLoan() {
  const [loan] = await db
    .insert(loans)
    .values(
      loanInput("owner", {
        status: "APPROVED",
        approvedPrincipalPoisha: 1_000_000n,
        decidedAt: new Date("2026-01-30T16:00:00Z"),
        decidedBy: usersByPerson.get("admin"),
      }),
    )
    .returning();
  return loan.id;
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
  const pinHash = await hashCredential(pin);
  for (const person of people) {
    const role = roles[person];
    const [user] = await db
      .insert(users)
      .values({
        email: address(person),
        fullName: `Fictional loan ${person}`,
        role,
        passwordHash,
      })
      .returning({ id: users.id });
    usersByPerson.set(person, user.id);
    if (role === "CUSTOMER") {
      const [profile] = await db
        .insert(customerProfiles)
        .values({
          userId: user.id,
          phone: "+1-202-555-0128",
          dateOfBirth: "1991-05-12",
          address: "Fictional loan address",
          identityReference: randomUUID(),
          verificationStatus: "VERIFIED",
          pinHash,
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
        })
        .returning({ id: bankAccounts.id });
      accounts.set(person, account.id);
    }
    const session = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: address(person), password })
      .expect(200);
    const cookie: unknown = session.headers["set-cookie"]?.[0];
    if (typeof cookie !== "string")
      throw new Error("Expected a session cookie.");
    cookies.set(person, cookie.split(";")[0]);
  }
}, 20_000);

async function clearLoans() {
  const scope = inArray(loans.customerId, [...profiles.values()]);
  const ids = db.select({ id: loans.id }).from(loans).where(scope);
  await db
    .delete(loanInstallments)
    .where(inArray(loanInstallments.loanId, ids));
  await db.delete(loanReviewNotes).where(inArray(loanReviewNotes.loanId, ids));
  await db.delete(transactions).where(inArray(transactions.loanId, ids));
  await db.delete(loans).where(scope);
}

beforeEach(clearLoans);
afterAll(async () => {
  try {
    if (db && usersByPerson.size) {
      await clearLoans();
      await db
        .delete(bankAccounts)
        .where(inArray(bankAccounts.id, [...accounts.values()]));
      await db
        .delete(authAttempts)
        .where(
          inArray(authAttempts.subject, [
            ...people.map((person) => authDigest("login", address(person))),
            ...usersByPerson.values(),
          ]),
        );
      await db
        .delete(users)
        .where(inArray(users.id, [...usersByPerson.values()]));
    }
  } finally {
    await db?.$client.end();
    vi.unstubAllEnvs();
  }
});

it("serves the catalog in exact poisha to authenticated workspaces", async () => {
  await request(app).get(`${prefix}/catalog`).expect(401);
  const response = await get("owner", "/catalog").expect(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body.products).toEqual([
    {
      type: "PERSONAL",
      label: "Personal",
      annualRateBps: 1200,
      minPrincipalPoisha: "1000000",
      maxPrincipalPoisha: "50000000",
      minTermMonths: 6,
      maxTermMonths: 36,
    },
    {
      type: "EDUCATION",
      label: "Education",
      annualRateBps: 1200,
      minPrincipalPoisha: "2000000",
      maxPrincipalPoisha: "80000000",
      minTermMonths: 6,
      maxTermMonths: 60,
    },
    {
      type: "BUSINESS",
      label: "Business",
      annualRateBps: 1200,
      minPrincipalPoisha: "5000000",
      maxPrincipalPoisha: "200000000",
      minTermMonths: 12,
      maxTermMonths: 60,
    },
  ]);
});

it("limits customer reads to owned loans and reserves review notes for Staff and Admin", async () => {
  const [owned, unrelated] = await db
    .insert(loans)
    .values([
      loanInput("owner", {
        status: "UNDER_REVIEW",
        reviewStartedAt: new Date(),
      }),
      loanInput("neighbor"),
    ])
    .returning();
  await db.insert(loanReviewNotes).values({
    loanId: owned.id,
    authorId: usersByPerson.get("staff")!,
    note: "Fictional internal review.",
  });
  const ownList = await get("owner").expect(200);
  expect(ownList.body.loans).toEqual([
    expect.objectContaining({
      id: owned.id,
      status: "UNDER_REVIEW",
      requestedPrincipalPoisha: "1000000",
      monthlyIncomePoisha: "5000000",
    }),
  ]);
  const ownDetail = await get("owner", `/${owned.id}`).expect(200);
  expect(ownDetail.body).not.toHaveProperty("notes");
  expect(ownDetail.body.loan).not.toHaveProperty("forwardedBy");
  expect(ownDetail.body.installments).toEqual([]);
  await get("owner", `/${unrelated.id}`).expect(404);
  await get("neighbor", `/${owned.id}`).expect(404);
  for (const person of ["staff", "admin"] as const) {
    const detail = await get(person, `/${owned.id}`).expect(200);
    expect(detail.body.notes).toEqual([
      expect.objectContaining({
        authorName: "Fictional loan staff",
        note: "Fictional internal review.",
      }),
    ]);
    const list = await get(person)
      .query({ status: "UNDER_REVIEW" })
      .expect(200);
    expect(list.body.loans).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: owned.id })]),
    );
  }
  await get("owner").query({ status: "UNKNOWN" }).expect(400);
});

it("lets Staff review customer context, save private notes and forward to Admin", async () => {
  const [loan] = await db.insert(loans).values(loanInput()).returning();
  const path = `/${loan.id}`;
  const note = "Fictional internal assessment.";

  const staffDetail = await get("staff", path).expect(200);
  expect(staffDetail.body.customer).toEqual({
    fullName: "Fictional loan owner",
    verificationStatus: "VERIFIED",
    accessActive: true,
    blocked: false,
    accountNumber: expect.any(String),
    accountType: "SAVINGS",
    accountStatus: "ACTIVE",
  });

  const started = await reviewAction("staff", loan.id, "review").expect(200);
  expect(started.body.loan).toMatchObject({
    status: "UNDER_REVIEW",
    reviewStartedAt: expect.any(String),
    reviewStartedBy: usersByPerson.get("staff"),
    forwardedAt: null,
  });
  const saved = await reviewAction("staff", loan.id, "notes", {
    note: `  ${note}  `,
  }).expect(201);
  expect(saved.body.note).toMatchObject({
    note,
    authorId: usersByPerson.get("staff"),
    createdAt: expect.any(String),
  });
  const before = await get("admin")
    .query({ status: "UNDER_REVIEW", forwarded: "false" })
    .expect(200);
  expect(before.body.loans).toContainEqual(
    expect.objectContaining({ id: loan.id }),
  );

  const forwarded = await reviewAction("staff", loan.id, "forward").expect(200);
  expect(forwarded.body.loan).toMatchObject({
    status: "UNDER_REVIEW",
    forwardedAt: expect.any(String),
    forwardedBy: usersByPerson.get("staff"),
    decidedAt: null,
    disbursedAt: null,
  });
  const queue = await get("admin")
    .query({ status: "UNDER_REVIEW", forwarded: "true" })
    .expect(200);
  expect(queue.body.loans).toContainEqual(forwarded.body.loan);
  const adminDetail = await get("admin", path).expect(200);
  expect(adminDetail.body.notes).toEqual([
    expect.objectContaining({ note, authorName: "Fictional loan staff" }),
  ]);
  const customerDetail = await get("owner", path).expect(200);
  expect(customerDetail.body.loan.status).toBe("UNDER_REVIEW");
  expect(customerDetail.body).not.toHaveProperty("notes");
  expect(customerDetail.body).not.toHaveProperty("customer");
  expect(customerDetail.body.loan).not.toHaveProperty("reviewStartedBy");
  expect(customerDetail.body.loan).not.toHaveProperty("forwardedBy");
  expect((await get("owner").expect(200)).text).not.toContain(note);
  expect(
    await db
      .select()
      .from(transactions)
      .where(eq(transactions.loanId, loan.id)),
  ).toEqual([]);
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.id, loan.disbursementAccountId));
  expect(account.balancePoisha).toBe(0n);
});

it("enforces review authorization, input validation and state boundaries", async () => {
  const [loan] = await db.insert(loans).values(loanInput()).returning();
  const note = { note: "Fictional review note." };
  const path = `${prefix}/${loan.id}`;

  for (const action of ["review", "notes", "forward"]) {
    await request(app)
      .post(`${path}/${action}`)
      .set("Origin", origin)
      .expect(401);
    await reviewAction("owner", loan.id, action, note).expect(403);
    await reviewAction("staff", loan.id, action, note)
      .set("Origin", "https://example.invalid")
      .expect(403);
  }
  await get("owner").query({ forwarded: "true" }).expect(403);
  await get("staff").query({ forwarded: "yes" }).expect(400);
  await reviewAction("staff", "not-a-uuid", "review").expect(400);
  await reviewAction("staff", randomUUID(), "review").expect(404);
  await reviewAction("staff", loan.id, "review", { status: "APPROVED" }).expect(
    400,
  );
  await reviewAction("staff", loan.id, "notes", note).expect(409);
  await reviewAction("staff", loan.id, "forward").expect(409);
  await reviewAction("staff", loan.id, "review").expect(200);
  for (const invalidNote of ["  ", "contains\0null", "x".repeat(2001)]) {
    await reviewAction("staff", loan.id, "notes", { note: invalidNote }).expect(
      400,
    );
  }
  await reviewAction("staff", loan.id, "notes", {
    ...note,
    authorId: usersByPerson.get("admin"),
  }).expect(400);
  await reviewAction("staff", loan.id, "forward", {
    disbursedAt: new Date(),
  }).expect(400);
  await reviewAction("staff", loan.id, "forward").expect(200);
  await reviewAction("staff", loan.id, "notes", note).expect(409);
  for (const action of ["approve", "reject", "disburse"]) {
    await reviewAction("staff", loan.id, action).expect(403);
  }

  const decided = await approvedLoan();
  await reviewAction("staff", decided, "review").expect(409);
  await reviewAction("staff", decided, "notes", note).expect(409);
  await reviewAction("staff", decided, "forward").expect(409);
});

async function forwardedLoan() {
  const [loan] = await db
    .insert(loans)
    .values(
      loanInput("owner", {
        status: "UNDER_REVIEW",
        reviewStartedAt: new Date(),
        forwardedAt: new Date(),
        forwardedBy: usersByPerson.get("staff"),
      }),
    )
    .returning();
  return loan.id;
}

const decision = { reason: "  Reviewed fictional application.  " };

it("restricts decisions to forwarded applications and records the winning decision", async () => {
  const [pending] = await db.insert(loans).values(loanInput()).returning();
  await reviewAction("admin", pending.id, "approve", decision).expect(409);
  await reviewAction("staff", pending.id, "approve", decision).expect(403);
  await reviewAction("owner", pending.id, "reject", decision).expect(403);
  await reviewAction("admin", pending.id, "disburse").expect(409);

  const id = await forwardedLoan();
  await reviewAction("admin", id, "approve", { reason: " " }).expect(400);
  await reviewAction("admin", id, "reject", { reason: "missing origin" })
    .set("Origin", "https://example.invalid")
    .expect(403);
  await reviewAction("admin", id, "approve", {
    ...decision,
    approvedPrincipalPoisha: "1",
  }).expect(400);
  const outcomes = await Promise.all([
    reviewAction("admin", id, "approve", decision),
    reviewAction("admin", id, "reject", decision),
  ]);
  expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([200, 409]);
  const [stored] = await db.select().from(loans).where(eq(loans.id, id));
  expect(stored).toMatchObject({
    decidedBy: usersByPerson.get("admin"),
    decidedAt: expect.any(Date),
  });
  expect(stored.approvalReason ?? stored.rejectionReason).toBe(
    decision.reason.trim(),
  );
  await reviewAction("admin", id, "approve", decision).expect(409);
  const customer = await get("owner", `/${id}`).expect(200);
  expect(customer.body.loan).not.toHaveProperty("approvalReason");
  expect(
    await db.select().from(transactions).where(eq(transactions.loanId, id)),
  ).toEqual([]);

  const rejectedId = await forwardedLoan();
  const rejected = await reviewAction(
    "admin",
    rejectedId,
    "reject",
    decision,
  ).expect(200);
  expect(rejected.body.loan).toMatchObject({
    status: "REJECTED",
    rejectionReason: decision.reason.trim(),
    approvedPrincipalPoisha: null,
  });
  await reviewAction("admin", rejectedId, "disburse").expect(409);
});

it("denies a loan decision when an applicant has since become Admin", async () => {
  const id = await forwardedLoan();
  const owner = eq(users.id, usersByPerson.get("owner")!);
  await db.update(users).set({ role: "ADMIN" }).where(owner);
  try {
    for (const action of ["approve", "reject"]) {
      const response = await reviewAction("owner", id, action, decision).expect(
        403,
      );
      expect(response.body.error.code).toBe("SELF_REVIEW");
    }
    const response = await reviewAction("owner", id, "disburse").expect(403);
    expect(response.body.error.code).toBe("SELF_REVIEW");
  } finally {
    await db.update(users).set({ role: "CUSTOMER" }).where(owner);
  }
});

it("disburses exactly once, rolls back a failed posting and recovers using the same reference", async () => {
  const id = await forwardedLoan();
  const accountId = accounts.get("owner")!;
  const account = eq(bankAccounts.id, accountId);
  await db.update(bankAccounts).set({ status: "FROZEN" }).where(account);
  try {
    await reviewAction("admin", id, "approve", decision).expect(409);
    await db.update(bankAccounts).set({ status: "ACTIVE" }).where(account);
    const approved = await reviewAction(
      "admin",
      id,
      "approve",
      decision,
    ).expect(200);
    expect(approved.body.loan).toMatchObject({
      status: "APPROVED",
      approvedPrincipalPoisha: "1000000",
      approvalReason: decision.reason.trim(),
    });
    await db.update(bankAccounts).set({ status: "FROZEN" }).where(account);
    await reviewAction("admin", id, "disburse").expect(409);
    expect(
      (await get("owner", `/${id}`).expect(200)).body.installments,
    ).toEqual([]);
    await db.update(bankAccounts).set({ status: "ACTIVE" }).where(account);

    // A preexisting conflicting ledger entry fails after the schedule and balance writes.
    const [conflicting] = await db
      .insert(transactions)
      .values({
        type: "LOAN_DISBURSEMENT",
        status: "COMPLETED",
        loanId: id,
        receiverAccountId: accountId,
        amountPoisha: 1_000_000n,
        description: "Fictional conflicting posting",
      })
      .returning();
    await reviewAction("admin", id, "disburse").expect(500);
    const unchanged = await get("owner", `/${id}`).expect(200);
    expect(unchanged.body.installments).toEqual([]);
    expect(unchanged.body.loan.status).toBe("APPROVED");
    expect(
      (await db.select().from(bankAccounts).where(account))[0].balancePoisha,
    ).toBe(0n);
    await db.delete(transactions).where(eq(transactions.id, conflicting.id));

    const [first, retry] = await Promise.all([
      reviewAction("admin", id, "disburse").expect(200),
      reviewAction("admin", id, "disburse").expect(200),
    ]);
    expect(retry.body).toEqual(first.body);
    expect(first.body.loan).toMatchObject({
      status: "ACTIVE",
      remainingPrincipalPoisha: "1000000",
    });
    const [posting] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.loanId, id));
    expect(posting).toMatchObject({
      reference: first.body.reference,
      receiverAccountId: accountId,
      amountPoisha: 1_000_000n,
    });
    expect(
      (await db.select().from(bankAccounts).where(account))[0].balancePoisha,
    ).toBe(1_000_000n);
    expect(
      (await get("owner", `/${id}`).expect(200)).body.installments,
    ).toHaveLength(6);
  } finally {
    await db
      .update(bankAccounts)
      .set({ status: "ACTIVE", balancePoisha: 0n })
      .where(account);
  }
});

it("reconciles the application, schedule, receipts and balance through final payoff", async () => {
  const created = await applyForLoan("owner", application()).expect(201);
  const id = created.body.loan.id as string;
  const accountId = accounts.get("owner")!;
  const account = eq(bankAccounts.id, accountId);
  const repay = (person: Person, number: number, changes?: object) =>
    reviewAction(person, id, `installments/${number}/repay`, {
      accountId,
      pin,
      ...changes,
    });
  await repay("owner", 1).expect(409);
  await reviewAction("staff", id, "review").expect(200);
  await reviewAction("staff", id, "notes", {
    note: "Fictional private lifecycle note.",
  }).expect(201);
  await reviewAction("staff", id, "forward").expect(200);
  await reviewAction("admin", id, "approve", decision).expect(200);
  const approved = await get("owner", `/${id}`).expect(200);
  expect(approved.body.loan).toMatchObject({
    status: "APPROVED",
    reviewStartedAt: expect.any(String),
    decidedAt: expect.any(String),
  });
  expect(approved.body.disbursementReference).toBeNull();
  const { body } = await reviewAction("admin", id, "disburse").expect(200);
  const receipt = (person: Person, reference: string) =>
    request(app)
      .get(`/api/v1/transactions/${reference}/receipt`)
      .set("Cookie", cookies.get(person)!);
  try {
    expect(
      (await receipt("owner", body.reference).expect(200)).body.transaction,
    ).toMatchObject({
      type: "LOAN_DISBURSEMENT",
      amountPoisha: "1000000",
      direction: "INCOMING",
    });
    await receipt("neighbor", body.reference).expect(404);
    await repay("staff", 1).expect(403);
    await repay("admin", 1).expect(403);
    await repay("neighbor", 1).expect(404);
    await repay("owner", 99).expect(400);
    await repay("owner", 1, { amountPoisha: "1" }).expect(400);
    await repay("owner", 1, { pin: "000000" }).expect(403);
    await repay("owner", 1).expect(409);
    await db
      .update(loanInstallments)
      .set({ dueDate: "2000-01-01" })
      .where(eq(loanInstallments.loanId, id));
    await repay("owner", 1, { accountId: accounts.get("neighbor") }).expect(
      404,
    );
    await db.update(bankAccounts).set({ status: "FROZEN" }).where(account);
    await repay("owner", 1).expect(409);
    await db
      .update(bankAccounts)
      .set({ status: "ACTIVE", balancePoisha: 0n })
      .where(account);
    await repay("owner", 1).expect(422);
    await db
      .update(bankAccounts)
      .set({ balancePoisha: 2_000_000n })
      .where(account);

    const [first, retry] = await Promise.all([
      repay("owner", 1).expect(200),
      repay("owner", 1).expect(200),
    ]);
    expect(retry.body).toEqual(first.body);
    expect(first.body.amountPoisha).toBe("172548");
    const partial = await get("owner", `/${id}`).expect(200);
    expect(partial.body.loan).toMatchObject({
      status: "ACTIVE",
      remainingPrincipalPoisha: "837452",
    });
    expect(partial.body.installments[0]).toMatchObject({
      payable: false,
      repaymentReference: first.body.reference,
      paidAmountPoisha: "172548",
    });
    expect(partial.body.installments[1].payable).toBe(true);
    for (let number = 2; number <= 5; number++)
      await repay("owner", number).expect(200);
    const [finalPayment, ...reads] = await Promise.all([
      repay("owner", 6).expect(200),
      ...(["owner", "admin", "owner", "admin"] as const).map((person) =>
        get(person, `/${id}`).expect(200),
      ),
    ]);
    expect(finalPayment.body.amountPoisha).toBe("172551");
    for (const read of reads) {
      const unpaid = (
        read.body.installments as {
          paidAt: string | null;
          principalPoisha: string;
        }[]
      ).filter((entry) => !entry.paidAt);
      expect(read.body.loan.remainingPrincipalPoisha).toBe(
        unpaid
          .reduce((total, entry) => total + BigInt(entry.principalPoisha), 0n)
          .toString(),
      );
      expect(read.body.loan.status).toBe(
        unpaid.length ? "ACTIVE" : "COMPLETED",
      );
    }
    const completed = await get("owner", `/${id}`).expect(200);
    expect(completed.body.loan).toMatchObject({
      status: "COMPLETED",
      remainingPrincipalPoisha: "0",
      completedAt: expect.any(String),
    });
    const postings = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.loanId, id),
          eq(transactions.type, "LOAN_REPAYMENT"),
        ),
      );
    expect(postings).toHaveLength(6);
    expect(completed.body.disbursementReference).toBe(body.reference);
    const adminHistory = await get("admin", `/${id}`).expect(200);
    expect(adminHistory.body.disbursementReference).toBe(body.reference);
    expect(adminHistory.body.decidedByName).toBe("Fictional loan admin");
    expect(adminHistory.body.notes).toHaveLength(1);
    expect(completed.body).not.toHaveProperty("decidedByName");
    expect(completed.body).not.toHaveProperty("notes");
    expect(completed.body.installments).toEqual(adminHistory.body.installments);
    for (const entry of completed.body.installments as {
      repaymentReference: string;
      paidAmountPoisha: string;
    }[]) {
      const ownerReceipt = await receipt(
        "owner",
        entry.repaymentReference,
      ).expect(200);
      expect(ownerReceipt.body.transaction).toMatchObject({
        type: "LOAN_REPAYMENT",
        status: "COMPLETED",
        amountPoisha: entry.paidAmountPoisha,
        feePoisha: "0",
      });
      await receipt("admin", entry.repaymentReference).expect(200);
    }
    await receipt("neighbor", first.body.reference).expect(404);
    expect(
      postings.every(
        (posting) =>
          posting.senderAccountId === accountId && posting.feePoisha === 0n,
      ),
    ).toBe(true);
    expect(
      (await db.select().from(bankAccounts).where(account))[0].balancePoisha,
    ).toBe(
      2_000_000n -
        postings.reduce((sum, posting) => sum + posting.amountPoisha, 0n),
    );
    await repay("owner", 1).expect(200, first.body);
    await repay("owner", 1, { accountId: accounts.get("neighbor") }).expect(
      409,
    );
    const recovered = await reviewAction("admin", id, "disburse").expect(200);
    expect(recovered.body.reference).toBe(body.reference);
  } finally {
    await db
      .update(bankAccounts)
      .set({ status: "ACTIVE", balancePoisha: 0n })
      .where(account);
  }
}, 20_000);

it("serializes concurrent repayments from the same account across loans", async () => {
  const ids = [await approvedLoan(), await approvedLoan()];
  const accountId = accounts.get("owner")!;
  const account = eq(bankAccounts.id, accountId);
  try {
    for (const id of ids)
      await reviewAction("admin", id, "disburse").expect(200);
    await db
      .update(loanInstallments)
      .set({ dueDate: "2000-01-01" })
      .where(inArray(loanInstallments.loanId, ids));
    await db
      .update(bankAccounts)
      .set({ balancePoisha: 172_548n })
      .where(account);
    const results = await Promise.all(
      ids.map((id) =>
        reviewAction("owner", id, "installments/1/repay", { accountId, pin }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 422]);
    expect(
      (await db.select().from(bankAccounts).where(account))[0].balancePoisha,
    ).toBe(0n);
    const repayments = await db
      .select()
      .from(transactions)
      .where(
        and(
          inArray(transactions.loanId, ids),
          eq(transactions.type, "LOAN_REPAYMENT"),
        ),
      );
    expect(repayments).toHaveLength(1);
  } finally {
    await db.update(bankAccounts).set({ balancePoisha: 0n }).where(account);
  }
});

it("keeps the original reviewer and forwarding actor on concurrent retries", async () => {
  const [loan] = await db.insert(loans).values(loanInput()).returning();
  const reviewers = ["staff", "admin"] as const;
  const actors = reviewers.map((person) => usersByPerson.get(person));
  const [firstReview, secondReview] = await Promise.all(
    reviewers.map((person) =>
      reviewAction(person, loan.id, "review").expect(200),
    ),
  );
  expect(secondReview.body).toEqual(firstReview.body);
  expect(actors).toContain(firstReview.body.loan.reviewStartedBy);
  const [firstForward, secondForward] = await Promise.all(
    reviewers.map((person) =>
      reviewAction(person, loan.id, "forward").expect(200),
    ),
  );
  expect(secondForward.body).toEqual(firstForward.body);
  expect(actors).toContain(firstForward.body.loan.forwardedBy);
  expect(firstForward.body.loan.reviewStartedBy).toBe(
    firstReview.body.loan.reviewStartedBy,
  );
  const stored = await get("admin", `/${loan.id}`).expect(200);
  expect(stored.body.loan).toEqual(firstForward.body.loan);
});

it("enforces account ownership and coherent decision and disbursement fields", async () => {
  const denied = [
    [
      { disbursementAccountId: accounts.get("neighbor")! },
      "loans_owned_disbursement_account_fk",
    ],
    [{ annualRateBps: 1000 }, "loans_baseline_terms"],
    [
      { status: "APPROVED", approvedPrincipalPoisha: 1_000_000n },
      "loans_decision_fields",
    ],
    [
      {
        status: "REJECTED",
        decidedBy: usersByPerson.get("admin"),
        decidedAt: new Date(),
      },
      "loans_decision_fields",
    ],
    [{ disbursedAt: new Date() }, "loans_disbursement_fields"],
    [{ forwardedBy: usersByPerson.get("staff") }, "loans_review_fields"],
  ] as const;
  for (const [values, constraint] of denied) {
    await expect(
      db.insert(loans).values(loanInput("owner", values)),
    ).rejects.toMatchObject({ cause: { constraint } });
  }
});

const postedAt = new Date("2026-01-30T18:30:00Z");

const applicationTerms = {
  type: "PERSONAL",
  requestedPrincipalPoisha: "1000000",
  termMonths: 6,
};
function application() {
  return {
    ...applicationTerms,
    disbursementAccountId: accounts.get("owner")!,
    monthlyIncomePoisha: "0",
    employmentStatus: " Self-employed ",
    description: " Fictional submitted application ",
  };
}
function applyForLoan(person: Person, input: object) {
  return request(app)
    .post(prefix)
    .set("Origin", origin)
    .set("Cookie", cookies.get(person)!)
    .send(input);
}

it("estimates EMI with server catalog limits and exact poisha", async () => {
  const base = { ...applicationTerms, termMonths: "6" };
  await request(app).get(`${prefix}/estimate`).query(base).expect(401);
  await get("owner", "/estimate")
    .query(base)
    .expect(200, { emiPoisha: "172548", annualRateBps: 1200 });
  await get("owner", "/estimate")
    .query({ ...base, termMonths: "37" })
    .expect(422);
  await get("owner", "/estimate")
    .query({ ...base, termMonths: "6.0" })
    .expect(400);
});

it("creates a pending application from a customer's verified request data", async () => {
  const created = await applyForLoan("owner", application()).expect(201);
  expect(created.body.loan).toMatchObject({
    ...applicationTerms,
    status: "PENDING",
    customerId: profiles.get("owner"),
    annualRateBps: 1200,
    disbursementAccountId: accounts.get("owner"),
    monthlyIncomePoisha: "0",
    employmentStatus: "Self-employed",
    description: "Fictional submitted application",
    approvedPrincipalPoisha: null,
    remainingPrincipalPoisha: null,
    createdAt: expect.any(String),
  });
  const id = created.body.loan.id as string;
  await get("owner", `/${id}`).expect(200, {
    loan: created.body.loan,
    disbursementReference: null,
    installments: [],
  });
  await get("neighbor", `/${id}`).expect(404);
  const visible = await get("owner").expect(200);
  expect(visible.body.loans).toEqual([created.body.loan]);
  const [account] = await db
    .select({ balance: bankAccounts.balancePoisha })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, accounts.get("owner")!));
  expect(account.balance).toBe(0n);
});

it("rejects unauthorized applications, invalid terms and ineligible accounts", async () => {
  const input = application();
  await applyForLoan("staff", input).expect(403);
  await applyForLoan("admin", input).expect(403);
  await applyForLoan("owner", input)
    .set("Origin", "https://example.invalid")
    .expect(403);
  await applyForLoan("owner", {
    ...input,
    status: "APPROVED",
    annualRateBps: 1,
  }).expect(400);
  await applyForLoan("owner", { ...input, monthlyIncomePoisha: 1000 }).expect(
    400,
  );
  await applyForLoan("owner", {
    ...input,
    requestedPrincipalPoisha: "999999",
  }).expect(422);
  await applyForLoan("owner", { ...input, termMonths: 37 }).expect(422);
  await applyForLoan("owner", {
    ...input,
    disbursementAccountId: accounts.get("neighbor")!,
  }).expect(404);
  const account = eq(bankAccounts.id, accounts.get("owner")!);
  await db.update(bankAccounts).set({ status: "FROZEN" }).where(account);
  try {
    const rejected = await applyForLoan("owner", input).expect(409);
    expect(rejected.body.error.code).toBe("ACCOUNT_RESTRICTED");
  } finally {
    await db.update(bankAccounts).set({ status: "ACTIVE" }).where(account);
  }
  await get("owner").expect(200, { loans: [], hasNextPage: false });
});

it("stores one schedule from approved terms using the Dhaka disbursement date", async () => {
  const [pending] = await db.insert(loans).values(loanInput()).returning();
  await expect(
    db.transaction((tx) => storeLoanSchedule(tx, pending.id, postedAt)),
  ).rejects.toMatchObject({ code: "LOAN_NOT_APPROVED" });
  const approved = await approvedLoan();
  const writes = await Promise.allSettled([
    db.transaction((tx) => storeLoanSchedule(tx, approved, postedAt)),
    db.transaction((tx) => storeLoanSchedule(tx, approved, postedAt)),
  ]);
  expect(writes.filter((write) => write.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(writes.find((write) => write.status === "rejected")).toMatchObject({
    reason: { code: "LOAN_SCHEDULE_EXISTS" },
  });
  const detail = await get("owner", `/${approved}`).expect(200);
  const installments = detail.body.installments as {
    principalPoisha: string;
  }[];
  expect(installments).toHaveLength(6);
  expect(installments[0]).toMatchObject({
    number: 1,
    dueDate: "2026-02-28",
    principalPoisha: "162548",
    interestPoisha: "10000",
    totalPoisha: "172548",
    paidAmountPoisha: null,
    repaymentReference: null,
  });
  expect(installments.at(-1)).toMatchObject({
    number: 6,
    dueDate: "2026-07-31",
    totalPoisha: "172551",
  });
  expect(
    installments.reduce(
      (amount, row) => amount + BigInt(row.principalPoisha),
      0n,
    ),
  ).toBe(1_000_000n);
});

it("links disbursement and repayment records and enforces one disbursement per loan", async () => {
  const loanId = await approvedLoan();
  const otherLoanId = await approvedLoan();
  await db.transaction((tx) => storeLoanSchedule(tx, loanId, postedAt));
  const disbursement = {
    loanId,
    receiverAccountId: accounts.get("owner"),
    type: "LOAN_DISBURSEMENT",
    status: "COMPLETED",
    amountPoisha: 1_000_000n,
    description: "Fictional disbursement",
  } as const;
  await db.insert(transactions).values(disbursement);
  await expect(
    db.insert(transactions).values(disbursement),
  ).rejects.toMatchObject({
    cause: { constraint: "transactions_loan_disbursement_unique" },
  });
  const repayment = {
    senderAccountId: accounts.get("owner"),
    type: "LOAN_REPAYMENT",
    status: "COMPLETED",
    amountPoisha: 172_548n,
    description: "Fictional first payment",
  } as const;
  const [wrongLoan] = await db
    .insert(transactions)
    .values({ ...repayment, loanId: otherLoanId })
    .returning();
  const [rightLoan] = await db
    .insert(transactions)
    .values({ ...repayment, loanId })
    .returning();
  const first = and(
    eq(loanInstallments.loanId, loanId),
    eq(loanInstallments.number, 1),
  );
  await expect(
    db
      .update(loanInstallments)
      .set({
        paidAt: postedAt,
        paidAmountPoisha: 172_548n,
        repaymentTransactionId: wrongLoan.id,
      })
      .where(first),
  ).rejects.toMatchObject({
    cause: { constraint: "loan_installments_repayment_loan_fk" },
  });
  await expect(
    db
      .update(loanInstallments)
      .set({
        paidAt: postedAt,
        paidAmountPoisha: 1n,
        repaymentTransactionId: rightLoan.id,
      })
      .where(first),
  ).rejects.toMatchObject({
    cause: { constraint: "loan_installments_payment_fields" },
  });
  await db
    .update(loanInstallments)
    .set({
      paidAt: postedAt,
      paidAmountPoisha: 172_548n,
      repaymentTransactionId: rightLoan.id,
    })
    .where(first);
  const detail = await get("owner", `/${loanId}`).expect(200);
  expect(detail.body.installments[0]).toMatchObject({
    paidAt: postedAt.toISOString(),
    paidAmountPoisha: "172548",
    repaymentReference: rightLoan.reference,
  });
});
