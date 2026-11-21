import { roundPoisha } from "../../lib/money.ts";
import { annualLoanRateBps, validLoanTerms, type LoanType } from "./catalog.ts";

const monthlyRateDenominator = 120_000n;
const monthlyRateNumerator = BigInt(annualLoanRateBps);

function dueDate(anchor: Date, monthsAfterDisbursement: number) {
  const due = new Date(anchor);
  due.setUTCMonth(anchor.getUTCMonth() + monthsAfterDisbursement, 1);
  const monthEnd = new Date(due);
  monthEnd.setUTCMonth(due.getUTCMonth() + 1, 0);
  due.setUTCDate(Math.min(anchor.getUTCDate(), monthEnd.getUTCDate()));
  return due.toISOString().slice(0, 10);
}

export function calculateLoanSchedule({
  type,
  principalPoisha,
  termMonths,
  disbursementDate,
}: {
  type: LoanType;
  principalPoisha: bigint;
  termMonths: number;
  disbursementDate: string;
}) {
  if (!validLoanTerms(type, principalPoisha, termMonths)) {
    throw new RangeError("Principal or term is outside the loan catalog.");
  }
  const anchor = new Date(`${disbursementDate}T00:00:00.000Z`);
  if (
    !Number.isFinite(anchor.getTime()) ||
    anchor.toISOString().slice(0, 10) !== disbursementDate ||
    anchor.getUTCFullYear() < 1 ||
    anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + termMonths >= 120_000
  ) {
    throw new RangeError(
      "Disbursement date must be a valid calendar date with room for the loan term.",
    );
  }

  // Apply the EMI formula as a fraction. Round only when converting to poisha.
  const growth =
    (monthlyRateDenominator + monthlyRateNumerator) ** BigInt(termMonths);
  const base = monthlyRateDenominator ** BigInt(termMonths);
  const emiPoisha = roundPoisha(
    principalPoisha * monthlyRateNumerator * growth,
    monthlyRateDenominator * (growth - base),
  );
  let remaining = principalPoisha;
  const installments = Array.from({ length: termMonths }, (_, index) => {
    const number = index + 1;
    const interestPoisha = roundPoisha(
      remaining * monthlyRateNumerator,
      monthlyRateDenominator,
    );
    const scheduledPrincipal =
      number === termMonths ? remaining : emiPoisha - interestPoisha;
    remaining -= scheduledPrincipal;
    return {
      number,
      dueDate: dueDate(anchor, number),
      principalPoisha: scheduledPrincipal,
      interestPoisha,
    };
  });
  return { emiPoisha, installments };
}
