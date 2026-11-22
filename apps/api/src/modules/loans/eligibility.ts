import { and, eq } from "drizzle-orm";
import { loans } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { dhakaDate } from "../../lib/dhaka-date.ts";
import { calculateLoanEmi } from "./calculations.ts";
import type { Loan, LoanTransaction } from "./service.ts";

export function isAdult(dateOfBirth: string, today: string) {
  const years = Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
  return years > 18 || (years === 18 && today.slice(5) >= dateOfBirth.slice(5));
}

export function fitsLoanIncome(
  totalEmiPoisha: bigint,
  monthlyIncomePoisha: bigint,
) {
  // Compare exact fractions so the 40% limit never rounds up.
  return totalEmiPoisha * 5n <= monthlyIncomePoisha * 2n;
}

export function assertApplicantEligibility(
  applicant: {
    verificationStatus: string;
    dateOfBirth: string;
  },
  today = dhakaDate(new Date()),
) {
  if (applicant.verificationStatus !== "VERIFIED") {
    throw new ApiError(
      409,
      "LOAN_APPLICANT_UNVERIFIED",
      "Verify the customer profile before applying for a loan.",
    );
  }
  if (!isAdult(applicant.dateOfBirth, today)) {
    throw new ApiError(
      422,
      "LOAN_APPLICANT_UNDERAGE",
      "Loan applicants must be at least 18 years old.",
    );
  }
}

type Terms = Pick<Loan, "type" | "termMonths" | "monthlyIncomePoisha">;

export async function assertLoanAffordability(
  tx: LoanTransaction,
  customerId: string,
  terms: Terms,
  principal: bigint,
) {
  const activeLoans = await tx
    .select({
      type: loans.type,
      principal: loans.approvedPrincipalPoisha,
      termMonths: loans.termMonths,
    })
    .from(loans)
    .where(and(eq(loans.customerId, customerId), eq(loans.status, "ACTIVE")));

  let total = calculateLoanEmi(terms.type, principal, terms.termMonths);
  for (const activeLoan of activeLoans) {
    if (activeLoan.principal === null) {
      throw new ApiError(
        409,
        "LOAN_LEDGER_INCONSISTENT",
        "An active loan could not be reconciled.",
      );
    }
    total += calculateLoanEmi(
      activeLoan.type,
      activeLoan.principal,
      activeLoan.termMonths,
    );
  }
  if (!fitsLoanIncome(total, terms.monthlyIncomePoisha)) {
    throw new ApiError(
      422,
      "LOAN_AFFORDABILITY_LIMIT",
      "Total monthly loan installments would exceed 40% of declared monthly income.",
    );
  }
}
