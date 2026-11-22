import { and, eq, isNull, ne } from "drizzle-orm";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  customerProfiles,
  loanInstallments,
  loans,
  transactions,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { dhakaDate } from "../../lib/dhaka-date.ts";
import { maxPoisha } from "../../lib/money.ts";
import { assertFinancialAccountEligible } from "../accounts/eligibility.ts";
import { verifyTransactionPin } from "../auth/customer-scope.ts";
import type { Identity } from "../auth/sessions.ts";
import {
  loanView,
  lockLoan,
  missingLoan,
  storeLoanSchedule,
  type Loan,
  type LoanTransaction,
} from "./service.ts";
import {
  assertApplicantEligibility,
  assertLoanAffordability,
} from "./eligibility.ts";
import { assertApplicationTerms } from "./validation.ts";

async function lockLoanOwner(
  tx: LoanTransaction,
  loan: Loan,
  serializeAffordability = false,
) {
  const [owner] = await tx
    .select({
      userId: users.id,
      verificationStatus: customerProfiles.verificationStatus,
      dateOfBirth: customerProfiles.dateOfBirth,
      role: users.role,
      accessActive: users.accessActive,
      blocked: users.blocked,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(eq(customerProfiles.id, loan.customerId))
    .for(serializeAffordability ? "no key update" : "share", {
      of: [customerProfiles, users],
    });
  if (!owner) throw missingLoan();
  return owner;
}

async function assertLoanAdmin(
  tx: LoanTransaction,
  adminId: string,
  ownerId: string,
) {
  if (adminId === ownerId) {
    throw new ApiError(
      403,
      "SELF_REVIEW",
      "You cannot decide or disburse your own loan.",
    );
  }
  const [admin] = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, adminId),
        eq(users.role, "ADMIN"),
        eq(users.accessActive, true),
        eq(users.blocked, false),
      ),
    )
    .for("share");
  if (!admin)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "This operation requires an active Admin.",
    );
}

async function eligibleLoanAccount(
  tx: LoanTransaction,
  customerId: string,
  accountId: string,
  owner: Awaited<ReturnType<typeof lockLoanOwner>>,
  lock: "share" | "no key update",
) {
  const [account] = await tx
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, accountId),
        eq(bankAccounts.customerId, customerId),
      ),
    )
    .for(lock);
  if (!account) throw new ApiError(404, "NOT_FOUND", "Loan account not found.");
  if (owner.role !== "CUSTOMER")
    throw new ApiError(
      409,
      "ACCOUNT_RESTRICTED",
      "The account holder is no longer eligible.",
    );
  assertFinancialAccountEligible({ ...owner, status: account.status });
  return account;
}

export function decideLoan(
  identity: Identity,
  id: string,
  status: "APPROVED" | "REJECTED",
  reason: string,
) {
  return getDatabase().transaction(async (tx) => {
    const loan = await lockLoan(tx, id);
    const owner = await lockLoanOwner(tx, loan, status === "APPROVED");
    await assertLoanAdmin(tx, identity.id, owner.userId);
    if (loan.status !== "UNDER_REVIEW" || !loan.forwardedAt) {
      throw new ApiError(
        409,
        "LOAN_NOT_FORWARDED",
        "The application must be under review and forwarded to Admin.",
      );
    }
    if (status === "APPROVED") {
      assertApplicationTerms(loan);
      await eligibleLoanAccount(
        tx,
        loan.customerId,
        loan.disbursementAccountId,
        owner,
        "share",
      );
      assertApplicantEligibility(owner);
      await assertLoanAffordability(
        tx,
        loan.customerId,
        loan,
        loan.requestedPrincipalPoisha,
      );
    }
    const decidedAt = new Date();
    const [updated] = await tx
      .update(loans)
      .set({
        status,
        decidedBy: identity.id,
        decidedAt,
        updatedAt: decidedAt,
        approvedPrincipalPoisha:
          status === "APPROVED" ? loan.requestedPrincipalPoisha : null,
        approvalReason: status === "APPROVED" ? reason : null,
        rejectionReason: status === "REJECTED" ? reason : null,
      })
      .where(eq(loans.id, id))
      .returning();
    return loanView(updated, identity);
  });
}

const ledgerMismatch = () =>
  new ApiError(
    409,
    "LOAN_LEDGER_INCONSISTENT",
    "The loan records could not be reconciled.",
  );

export function disburseLoan(identity: Identity, id: string) {
  return getDatabase().transaction(async (tx) => {
    const loan = await lockLoan(tx, id);
    // Serialize activation using the applicant row, even across different loan accounts.
    const owner = await lockLoanOwner(tx, loan, true);
    await assertLoanAdmin(tx, identity.id, owner.userId);
    if (loan.status === "ACTIVE" || loan.status === "COMPLETED") {
      const [posting] = await tx
        .select({ reference: transactions.reference })
        .from(transactions)
        .where(
          and(
            eq(transactions.loanId, id),
            eq(transactions.type, "LOAN_DISBURSEMENT"),
          ),
        );
      if (!posting) throw ledgerMismatch();
      return { loan: loanView(loan, identity), reference: posting.reference };
    }
    if (loan.status !== "APPROVED" || loan.approvedPrincipalPoisha === null) {
      throw new ApiError(
        409,
        "LOAN_NOT_APPROVED",
        "The loan must be approved before disbursement.",
      );
    }

    const account = await eligibleLoanAccount(
      tx,
      loan.customerId,
      loan.disbursementAccountId,
      owner,
      "no key update",
    );
    assertApplicantEligibility(owner);
    await assertLoanAffordability(
      tx,
      loan.customerId,
      loan,
      loan.approvedPrincipalPoisha,
    );
    const balancePoisha = account.balancePoisha + loan.approvedPrincipalPoisha;
    if (balancePoisha > maxPoisha)
      throw new ApiError(
        422,
        "ACCOUNT_BALANCE_LIMIT",
        "The account cannot accept this disbursement.",
      );
    const now = new Date();
    await storeLoanSchedule(tx, id, now);
    await tx
      .update(bankAccounts)
      .set({ balancePoisha, updatedAt: now })
      .where(eq(bankAccounts.id, account.id));
    const [posting] = await tx
      .insert(transactions)
      .values({
        type: "LOAN_DISBURSEMENT",
        status: "COMPLETED",
        loanId: id,
        receiverAccountId: account.id,
        initiatedBy: identity.id,
        amountPoisha: loan.approvedPrincipalPoisha,
        description: "Loan disbursement",
        createdAt: now,
      })
      .returning({ reference: transactions.reference });
    const [updated] = await tx
      .update(loans)
      .set({
        status: "ACTIVE",
        disbursedAt: now,
        remainingPrincipalPoisha: loan.approvedPrincipalPoisha,
        updatedAt: now,
      })
      .where(eq(loans.id, id))
      .returning();
    return { loan: loanView(updated, identity), reference: posting.reference };
  });
}

export async function repayInstallment(
  identity: Identity,
  id: string,
  number: number,
  accountId: string,
  pin: string,
) {
  const db = getDatabase();
  const [owned] = await db
    .select({ id: loans.id })
    .from(loans)
    .innerJoin(customerProfiles, eq(customerProfiles.id, loans.customerId))
    .where(and(eq(loans.id, id), eq(customerProfiles.userId, identity.id)));
  if (!owned) throw missingLoan();
  const pinHash = await verifyTransactionPin(identity, pin);

  return db.transaction(async (tx) => {
    const loan = await lockLoan(tx, id);
    const owner = await lockLoanOwner(tx, loan);
    if (owner.userId !== identity.id || owner.role !== "CUSTOMER")
      throw missingLoan();
    if (owner.blocked || !owner.accessActive)
      throw new ApiError(
        403,
        "ACCOUNT_RESTRICTED",
        "This account's access is restricted.",
      );
    const [profile] = await tx
      .select({ pinHash: customerProfiles.pinHash })
      .from(customerProfiles)
      .where(eq(customerProfiles.id, loan.customerId));
    if (profile.pinHash !== pinHash)
      throw new ApiError(
        409,
        "PIN_CHANGED",
        "The transaction PIN changed. Please try again.",
      );
    if (loan.status !== "ACTIVE" && loan.status !== "COMPLETED") {
      throw new ApiError(
        409,
        "LOAN_NOT_ACTIVE",
        "The loan must be active before repayment.",
      );
    }

    const [installment] = await tx
      .select()
      .from(loanInstallments)
      .where(
        and(
          eq(loanInstallments.loanId, id),
          eq(loanInstallments.number, number),
        ),
      );
    if (!installment)
      throw new ApiError(404, "NOT_FOUND", "Installment not found.");
    const amountPoisha =
      installment.principalPoisha + installment.interestPoisha;
    if (installment.repaymentTransactionId) {
      const [posting] = await tx
        .select({
          reference: transactions.reference,
          accountId: transactions.senderAccountId,
          amountPoisha: transactions.amountPoisha,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.id, installment.repaymentTransactionId),
            eq(transactions.type, "LOAN_REPAYMENT"),
            eq(transactions.status, "COMPLETED"),
          ),
        );
      if (!posting || posting.amountPoisha !== amountPoisha)
        throw ledgerMismatch();
      if (posting.accountId !== accountId)
        throw new ApiError(
          409,
          "INSTALLMENT_ALREADY_PAID",
          "This installment has already been paid.",
        );
      return {
        reference: posting.reference,
        amountPoisha: amountPoisha.toString(),
      };
    }

    const now = new Date();
    if (installment.dueDate > dhakaDate(now))
      throw new ApiError(
        409,
        "INSTALLMENT_NOT_DUE",
        "This installment is not due yet.",
      );
    if (loan.status !== "ACTIVE" || loan.remainingPrincipalPoisha === null)
      throw ledgerMismatch();
    const account = await eligibleLoanAccount(
      tx,
      loan.customerId,
      accountId,
      owner,
      "no key update",
    );
    if (account.balancePoisha - account.heldBalancePoisha < amountPoisha)
      throw new ApiError(
        422,
        "INSUFFICIENT_FUNDS",
        "The account cannot cover this installment.",
      );

    const remaining =
      loan.remainingPrincipalPoisha - installment.principalPoisha;
    const [anotherUnpaid] = await tx
      .select({ id: loanInstallments.id })
      .from(loanInstallments)
      .where(
        and(
          eq(loanInstallments.loanId, id),
          ne(loanInstallments.id, installment.id),
          isNull(loanInstallments.paidAt),
        ),
      )
      .limit(1);
    const completed = !anotherUnpaid;
    if (remaining < 0n || completed !== (remaining === 0n))
      throw ledgerMismatch();
    await tx
      .update(bankAccounts)
      .set({
        balancePoisha: account.balancePoisha - amountPoisha,
        updatedAt: now,
      })
      .where(eq(bankAccounts.id, account.id));
    const [posting] = await tx
      .insert(transactions)
      .values({
        type: "LOAN_REPAYMENT",
        status: "COMPLETED",
        loanId: id,
        senderAccountId: account.id,
        initiatedBy: identity.id,
        amountPoisha,
        description: `Loan installment ${installment.number}`,
        createdAt: now,
      })
      .returning({ id: transactions.id, reference: transactions.reference });
    await tx
      .update(loanInstallments)
      .set({
        paidAt: now,
        paidAmountPoisha: amountPoisha,
        repaymentTransactionId: posting.id,
      })
      .where(eq(loanInstallments.id, installment.id));
    await tx
      .update(loans)
      .set({
        status: completed ? "COMPLETED" : "ACTIVE",
        remainingPrincipalPoisha: remaining,
        completedAt: completed ? now : null,
        updatedAt: now,
      })
      .where(eq(loans.id, id));
    return {
      reference: posting.reference,
      amountPoisha: amountPoisha.toString(),
    };
  });
}
