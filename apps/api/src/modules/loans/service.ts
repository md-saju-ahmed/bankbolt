import { and, asc, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  customerProfiles,
  loanInstallments,
  loanReviewNotes,
  loans,
  transactions,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { dhakaDate } from "../../lib/dhaka-date.ts";
import type { Identity } from "../auth/sessions.ts";
import { assertFinancialAccountEligible } from "../accounts/eligibility.ts";
import { calculateLoanSchedule } from "./calculations.ts";
import { assertApplicationTerms, type applicationInput } from "./validation.ts";

export type Loan = typeof loans.$inferSelect;

function scopedLoans(identity: Identity, condition?: SQL) {
  const scope =
    identity.role === "CUSTOMER"
      ? eq(customerProfiles.userId, identity.id)
      : undefined;
  return getDatabase()
    .select({ loan: loans })
    .from(loans)
    .innerJoin(customerProfiles, eq(customerProfiles.id, loans.customerId))
    .where(and(scope, condition));
}

export function loanView(loan: Loan, identity: Identity) {
  const {
    approvalReason,
    decidedBy,
    forwardedBy,
    reviewStartedBy,
    ...details
  } = loan;
  return {
    ...details,
    requestedPrincipalPoisha: loan.requestedPrincipalPoisha.toString(),
    approvedPrincipalPoisha: loan.approvedPrincipalPoisha?.toString() ?? null,
    remainingPrincipalPoisha: loan.remainingPrincipalPoisha?.toString() ?? null,
    monthlyIncomePoisha: loan.monthlyIncomePoisha.toString(),
    ...(identity.role === "CUSTOMER"
      ? {}
      : { approvalReason, decidedBy, forwardedBy, reviewStartedBy }),
  };
}

export async function listLoans(
  identity: Identity,
  {
    page,
    status,
    forwarded,
  }: {
    page: number;
    status?: Loan["status"];
    forwarded?: "true" | "false";
  },
) {
  const size = 20;
  const forwardingFilter = {
    true: isNotNull(loans.forwardedAt),
    false: isNull(loans.forwardedAt),
  };
  const rows = await scopedLoans(
    identity,
    and(
      status ? eq(loans.status, status) : undefined,
      forwarded === undefined ? undefined : forwardingFilter[forwarded],
    ),
  )
    .orderBy(desc(loans.createdAt), desc(loans.id))
    .limit(size + 1)
    .offset((page - 1) * size);
  return {
    loans: rows.slice(0, size).map(({ loan }) => loanView(loan, identity)),
    hasNextPage: rows.length > size,
  };
}

export const missingLoan = () =>
  new ApiError(404, "NOT_FOUND", "Loan not found.");

export function createLoanApplication(
  identity: Identity,
  input: z.infer<typeof applicationInput>,
) {
  assertApplicationTerms(input);
  return getDatabase().transaction(async (tx) => {
    const [owner] = await tx
      .select({
        customerId: customerProfiles.id,
        blocked: users.blocked,
        accessActive: users.accessActive,
      })
      .from(customerProfiles)
      .innerJoin(users, eq(users.id, customerProfiles.userId))
      .where(and(eq(users.id, identity.id), eq(users.role, "CUSTOMER")))
      .for("share", { of: [customerProfiles, users] });
    const unavailable = () =>
      new ApiError(404, "NOT_FOUND", "Disbursement account not found.");
    if (!owner) throw unavailable();
    const [account] = await tx
      .select({ status: bankAccounts.status })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, input.disbursementAccountId),
          eq(bankAccounts.customerId, owner.customerId),
        ),
      )
      .for("share");
    if (!account) throw unavailable();
    assertFinancialAccountEligible({ ...owner, status: account.status });
    const [loan] = await tx
      .insert(loans)
      .values({ ...input, customerId: owner.customerId })
      .returning();
    return loanView(loan, identity);
  });
}

export async function getLoan(identity: Identity, id: string) {
  const [row] = await scopedLoans(identity, eq(loans.id, id));
  if (!row) throw missingLoan();
  const db = getDatabase();
  const installments = await db
    .select({
      installment: loanInstallments,
      repaymentReference: transactions.reference,
    })
    .from(loanInstallments)
    .leftJoin(
      transactions,
      eq(transactions.id, loanInstallments.repaymentTransactionId),
    )
    .where(eq(loanInstallments.loanId, id))
    .orderBy(asc(loanInstallments.number));
  const today = dhakaDate(new Date());
  const detail = {
    loan: loanView(row.loan, identity),
    installments: installments.map(({ installment, repaymentReference }) => ({
      number: installment.number,
      dueDate: installment.dueDate,
      principalPoisha: installment.principalPoisha.toString(),
      interestPoisha: installment.interestPoisha.toString(),
      totalPoisha: (
        installment.principalPoisha + installment.interestPoisha
      ).toString(),
      paidAmountPoisha: installment.paidAmountPoisha?.toString() ?? null,
      paidAt: installment.paidAt,
      repaymentReference,
      payable:
        row.loan.status === "ACTIVE" &&
        !installment.paidAt &&
        installment.dueDate <= today,
    })),
  };
  if (identity.role === "CUSTOMER") return detail;

  const [customer] = await db
    .select({
      fullName: users.fullName,
      verificationStatus: customerProfiles.verificationStatus,
      accessActive: users.accessActive,
      blocked: users.blocked,
      accountNumber: bankAccounts.accountNumber,
      accountType: bankAccounts.type,
      accountStatus: bankAccounts.status,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .innerJoin(
      bankAccounts,
      eq(bankAccounts.id, row.loan.disbursementAccountId),
    )
    .where(eq(customerProfiles.id, row.loan.customerId));
  const notes = await db
    .select({
      id: loanReviewNotes.id,
      authorId: loanReviewNotes.authorId,
      authorName: users.fullName,
      note: loanReviewNotes.note,
      createdAt: loanReviewNotes.createdAt,
    })
    .from(loanReviewNotes)
    .innerJoin(users, eq(users.id, loanReviewNotes.authorId))
    .where(eq(loanReviewNotes.loanId, id))
    .orderBy(desc(loanReviewNotes.createdAt), desc(loanReviewNotes.id));
  return { ...detail, customer, notes };
}

type TransactionWork = Parameters<
  ReturnType<typeof getDatabase>["transaction"]
>[0];
export type LoanTransaction = Parameters<TransactionWork>[0];

export async function lockLoan(tx: LoanTransaction, id: string) {
  const [loan] = await tx
    .select()
    .from(loans)
    .where(eq(loans.id, id))
    .for("no key update");
  if (!loan) throw missingLoan();
  return loan;
}

export function startLoanReview(identity: Identity, id: string) {
  return getDatabase().transaction(async (tx) => {
    const loan = await lockLoan(tx, id);
    if (loan.status === "UNDER_REVIEW") return loanView(loan, identity);
    if (loan.status !== "PENDING") {
      throw new ApiError(
        409,
        "LOAN_NOT_PENDING",
        "Only pending loans can enter review.",
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(loans)
      .set({
        status: "UNDER_REVIEW",
        reviewStartedAt: now,
        reviewStartedBy: identity.id,
        updatedAt: now,
      })
      .where(eq(loans.id, id))
      .returning();
    return loanView(updated, identity);
  });
}

function assertLoanUnderReview(loan: Loan) {
  if (loan.status !== "UNDER_REVIEW") {
    throw new ApiError(
      409,
      "LOAN_NOT_UNDER_REVIEW",
      "The loan must be under review.",
    );
  }
}

export function addLoanReviewNote(
  identity: Identity,
  id: string,
  note: string,
) {
  return getDatabase().transaction(async (tx) => {
    const loan = await lockLoan(tx, id);
    assertLoanUnderReview(loan);
    if (loan.forwardedAt) {
      throw new ApiError(
        409,
        "LOAN_ALREADY_FORWARDED",
        "The review has been forwarded to Admin.",
      );
    }

    const [savedNote] = await tx
      .insert(loanReviewNotes)
      .values({ loanId: id, authorId: identity.id, note })
      .returning();
    return savedNote;
  });
}

export function forwardLoan(identity: Identity, id: string) {
  return getDatabase().transaction(async (tx) => {
    const loan = await lockLoan(tx, id);
    assertLoanUnderReview(loan);
    if (loan.forwardedAt) return loanView(loan, identity);

    const now = new Date();
    const [updated] = await tx
      .update(loans)
      .set({ forwardedAt: now, forwardedBy: identity.id, updatedAt: now })
      .where(eq(loans.id, id))
      .returning();
    return loanView(updated, identity);
  });
}

// Store the schedule in the same transaction that posts the disbursement and activates the loan.
export async function storeLoanSchedule(
  tx: LoanTransaction,
  loanId: string,
  disbursedAt: Date,
) {
  const [loan] = await tx
    .select({
      type: loans.type,
      status: loans.status,
      principalPoisha: loans.approvedPrincipalPoisha,
      termMonths: loans.termMonths,
    })
    .from(loans)
    .where(eq(loans.id, loanId))
    .for("no key update");
  if (!loan) throw missingLoan();
  if (loan.status !== "APPROVED" || loan.principalPoisha === null) {
    throw new ApiError(
      409,
      "LOAN_NOT_APPROVED",
      "The loan must be approved before scheduling installments.",
    );
  }
  const [existing] = await tx
    .select({ id: loanInstallments.id })
    .from(loanInstallments)
    .where(eq(loanInstallments.loanId, loanId))
    .limit(1);
  if (existing) {
    throw new ApiError(
      409,
      "LOAN_SCHEDULE_EXISTS",
      "This loan already has a repayment schedule.",
    );
  }
  const schedule = calculateLoanSchedule({
    type: loan.type,
    principalPoisha: loan.principalPoisha,
    termMonths: loan.termMonths,
    disbursementDate: dhakaDate(disbursedAt),
  });
  await tx
    .insert(loanInstallments)
    .values(
      schedule.installments.map((installment) => ({ ...installment, loanId })),
    );
  return schedule;
}
