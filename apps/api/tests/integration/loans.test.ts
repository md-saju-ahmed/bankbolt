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
