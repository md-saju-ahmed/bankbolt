import { baseApi } from "@/lib/api/base-api";

export const loanLabels = {
  PERSONAL: "Personal",
  EDUCATION: "Education",
  BUSINESS: "Business",
} as const;
export const loanStatuses = {
  PENDING: "Pending",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ACTIVE: "Active",
  COMPLETED: "Completed",
} as const;
export type LoanType = keyof typeof loanLabels;
type LoanStatus = keyof typeof loanStatuses;
export type LoanTerms = {
  type: LoanType;
  requestedPrincipalPoisha: string;
  termMonths: number;
};
export type LoanApplicationInput = LoanTerms & {
  disbursementAccountId: string;
  monthlyIncomePoisha: string;
  employmentStatus: string;
  description: string;
};
export type LoanApplication = LoanApplicationInput & {
  id: string;
  status: LoanStatus;
  annualRateBps: number;
  createdAt: string;
  rejectionReason: string | null;
};
type ReviewLoan = LoanApplication & { forwardedAt: string | null };
type LoanReview = {
  loan: ReviewLoan;
  customer: {
    fullName: string;
    verificationStatus: string;
    accessActive: boolean;
    blocked: boolean;
    accountNumber: string;
    accountType: string;
    accountStatus: string;
  };
  notes: { id: string; authorName: string; note: string; createdAt: string }[];
};
type ReviewAction = { id: string } & (
  { action: "review" | "forward" } | { action: "notes"; note: string }
);
export type LoanProduct = {
  type: LoanType;
  label: string;
  annualRateBps: number;
  minPrincipalPoisha: string;
  maxPrincipalPoisha: string;
  minTermMonths: number;
  maxTermMonths: number;
};
type Estimate = { emiPoisha: string; annualRateBps: number };

const loansApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    loanCatalog: build.query<{ products: LoanProduct[] }, void>({
      query: () => ({ url: "/loans/catalog", cache: "no-store" }),
      keepUnusedDataFor: 0,
    }),
    loanEstimate: build.query<Estimate, LoanTerms>({
      query: (params) => ({
        url: "/loans/estimate",
        params,
        cache: "no-store",
        timeout: 12_000,
      }),
      keepUnusedDataFor: 0,
    }),
    customerLoans: build.query<
      { loans: LoanApplication[]; hasNextPage: boolean },
      number
    >({
      query: (page) => ({ url: "/loans", params: { page }, cache: "no-store" }),
      providesTags: ["Loans"],
      keepUnusedDataFor: 0,
    }),
    loanReviewQueue: build.query<
      { loans: ReviewLoan[]; hasNextPage: boolean },
      { page: number; status: "PENDING" | "UNDER_REVIEW"; forwarded?: boolean }
    >({
      query: (params) => ({ url: "/loans", params, cache: "no-store" }),
      providesTags: ["Loans"],
      keepUnusedDataFor: 0,
    }),
    loanReview: build.query<LoanReview, string>({
      query: (id) => ({ url: `/loans/${id}`, cache: "no-store" }),
      providesTags: ["Loans"],
      keepUnusedDataFor: 0,
    }),
    reviewLoan: build.mutation<unknown, ReviewAction>({
      query: ({ id, action, ...body }) => ({
        url: `/loans/${id}/${action}`,
        method: "POST",
        body,
        timeout: 15_000,
      }),
      invalidatesTags: ["Loans"],
    }),
    submitLoanApplication: build.mutation<
      { loan: LoanApplication },
      LoanApplicationInput
    >({
      query: (body) => ({
        url: "/loans",
        method: "POST",
        body,
        timeout: 15_000,
      }),
      invalidatesTags: (data) => (data ? ["Loans"] : []),
    }),
  }),
});

export const {
  useLoanCatalogQuery,
  useLazyLoanEstimateQuery,
  useCustomerLoansQuery,
  useLoanReviewQueueQuery,
  useLoanReviewQuery,
  useReviewLoanMutation,
  useSubmitLoanApplicationMutation,
} = loansApi;
