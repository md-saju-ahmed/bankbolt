import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { getDatabase } from "../../db/client.ts";
import {
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
import { calculateLoanSchedule } from "./calculations.ts";

type Loan = typeof loans.$inferSelect;

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

function loanView(loan: Loan, identity: Identity) {
  const { decidedBy, forwardedBy, ...details } = loan;
  return {
    ...details,
    requestedPrincipalPoisha: loan.requestedPrincipalPoisha.toString(),
    approvedPrincipalPoisha: loan.approvedPrincipalPoisha?.toString() ?? null,
    remainingPrincipalPoisha: loan.remainingPrincipalPoisha?.toString() ?? null,
    monthlyIncomePoisha: loan.monthlyIncomePoisha.toString(),
    ...(identity.role === "CUSTOMER" ? {} : { decidedBy, forwardedBy }),
  };
}

export async function listLoans(
  identity: Identity,
  page: number,
  status?: Loan["status"],
) {
  const size = 20;
  const rows = await scopedLoans(
    identity,
    status ? eq(loans.status, status) : undefined,
  )
    .orderBy(desc(loans.createdAt), desc(loans.id))
    .limit(size + 1)
    .offset((page - 1) * size);
  return {
    loans: rows.slice(0, size).map(({ loan }) => loanView(loan, identity)),
    hasNextPage: rows.length > size,
  };
}

const missingLoan = () => new ApiError(404, "NOT_FOUND", "Loan not found.");

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
    })),
  };
  if (identity.role === "CUSTOMER") return detail;

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
  return { ...detail, notes };
}

type TransactionWork = Parameters<
  ReturnType<typeof getDatabase>["transaction"]
>[0];
type LoanTransaction = Parameters<TransactionWork>[0];

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
