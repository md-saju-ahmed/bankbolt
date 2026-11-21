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
      await db.delete(authAttempts).where(
        inArray(
          authAttempts.subject,
          people.map((person) => authDigest("login", address(person))),
        ),
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
    await reviewAction("staff", loan.id, action).expect(404);
  }

  const decided = await approvedLoan();
  await reviewAction("staff", decided, "review").expect(409);
  await reviewAction("staff", decided, "notes", note).expect(409);
  await reviewAction("staff", decided, "forward").expect(409);
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
