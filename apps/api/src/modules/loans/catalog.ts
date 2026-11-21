export const loanTypes = ["PERSONAL", "EDUCATION", "BUSINESS"] as const;
export type LoanType = (typeof loanTypes)[number];

export const annualLoanRateBps = 1_200;

export const loanCatalog = {
  PERSONAL: {
    label: "Personal",
    minPrincipalPoisha: 1_000_000n,
    maxPrincipalPoisha: 50_000_000n,
    minTermMonths: 6,
    maxTermMonths: 36,
  },
  EDUCATION: {
    label: "Education",
    minPrincipalPoisha: 2_000_000n,
    maxPrincipalPoisha: 80_000_000n,
    minTermMonths: 6,
    maxTermMonths: 60,
  },
  BUSINESS: {
    label: "Business",
    minPrincipalPoisha: 5_000_000n,
    maxPrincipalPoisha: 200_000_000n,
    minTermMonths: 12,
    maxTermMonths: 60,
  },
} as const satisfies Record<
  LoanType,
  {
    label: string;
    minPrincipalPoisha: bigint;
    maxPrincipalPoisha: bigint;
    minTermMonths: number;
    maxTermMonths: number;
  }
>;

export function validLoanTerms(
  type: LoanType,
  principalPoisha: bigint,
  termMonths: number,
) {
  const terms = loanCatalog[type];
  return (
    Number.isInteger(termMonths) &&
    termMonths >= terms.minTermMonths &&
    termMonths <= terms.maxTermMonths &&
    principalPoisha >= terms.minPrincipalPoisha &&
    principalPoisha <= terms.maxPrincipalPoisha
  );
}
