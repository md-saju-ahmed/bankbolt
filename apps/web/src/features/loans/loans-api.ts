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
export type LoanRecord = LoanApplication & {
  approvedPrincipalPoisha: string | null;
  remainingPrincipalPoisha: string | null;
  reviewStartedAt: string | null;
  decidedAt: string | null;
  disbursedAt: string | null;
  completedAt: string | null;
};
export type ReviewLoan = LoanRecord & {
  forwardedAt: string | null;
  decidedBy: string | null;
  approvalReason: string | null;
};
export type LoanInstallment = {
  number: number;
  dueDate: string;
  principalPoisha: string;
  interestPoisha: string;
  totalPoisha: string;
  overdueInterestPoisha: string;
  amountDuePoisha: string | null;
  status: "PAID" | "OVERDUE" | "IN_GRACE" | "DUE" | "SCHEDULED" | "CLOSED";
  paidAmountPoisha: string | null;
  paidAt: string | null;
  repaymentReference: string | null;
  payable: boolean;
};
export type SettlementQuote = {
  principalPoisha: string;
  scheduledInterestPoisha: string;
  overdueInterestPoisha: string;
  amountPoisha: string;
};
export type LoanSettlement = SettlementQuote & { reference: string };

type CustomerLoanDetail = {
  loan: LoanRecord;
  installments: LoanInstallment[];
  settlementQuote?: SettlementQuote;
  settlement?: LoanSettlement;
  disbursementReference: string | null;
};
type LoanReview = CustomerLoanDetail & {
  loan: ReviewLoan;
  decidedByName: string | null;
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
type AdminAction = { id: string } & (
  { action: "approve" | "reject"; reason: string } | { action: "disburse" }
);
type LoanReceipt = { reference: string; amountPoisha: string };
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
      { page: number; status: LoanStatus; forwarded?: boolean }
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
    adminLoanAction: build.mutation<
      { loan: ReviewLoan; reference?: string },
      AdminAction
    >({
      query: ({ id, action, ...body }) => ({
        url: `/loans/${id}/${action}`,
        method: "POST",
        body,
        timeout: 15_000,
      }),
      invalidatesTags: (_result, _error, { action }) =>
        action === "disburse"
          ? ["Loans", "OwnedAccounts", "Transactions"]
          : ["Loans"],
    }),
    customerLoanDetail: build.query<CustomerLoanDetail, string>({
      query: (id) => ({ url: `/loans/${id}`, cache: "no-store" }),
      providesTags: ["Loans"],
      keepUnusedDataFor: 0,
    }),
    repayLoan: build.mutation<
      LoanReceipt,
      {
        id: string;
        number: number;
        accountId: string;
        pin: string;
        expectedAmountPoisha: string;
      }
    >({
      query: ({ id, number, ...body }) => ({
        url: `/loans/${id}/installments/${number}/repay`,
        method: "POST",
        body,
        timeout: 15_000,
      }),
      invalidatesTags: ["Loans", "OwnedAccounts", "Transactions"],
    }),
    settleLoan: build.mutation<
      LoanReceipt,
      {
        id: string;
        accountId: string;
        pin: string;
        expectedAmountPoisha: string;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/loans/${id}/settle`,
        method: "POST",
        body,
        timeout: 15_000,
      }),
      invalidatesTags: [
        "Loans",
        "OwnedAccounts",
        "Management",
        "OnboardingAccounts",
        "Transactions",
      ],
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
  useAdminLoanActionMutation,
  useCustomerLoanDetailQuery,
  useRepayLoanMutation,
  useSettleLoanMutation,
  useSubmitLoanApplicationMutation,
} = loansApi;
