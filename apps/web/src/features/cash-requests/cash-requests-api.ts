import { baseApi } from "@/lib/api/base-api";

export const cashRequestTypes = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
} as const;

export const cashRequestStatuses = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
} as const;

export type CashRequestType = keyof typeof cashRequestTypes;
export type CashRequestStatus = keyof typeof cashRequestStatuses;
export type CashRequestInput = {
  accountId: string;
  type: CashRequestType;
  amountPoisha: string;
  description: string;
};
export type CashRequest = CashRequestInput & {
  id: string;
  accountNumber: string;
  status: CashRequestStatus;
  createdAt: string;
  rejectionReason: string | null;
  transactionReference: string | null;
};
export type ReviewCashRequest = CashRequest & {
  customerName: string;
  reviewerName: string | null;
  reviewedAt: string | null;
};
export type CashDecision =
  { action: "approve" } | { action: "reject"; reason: string };

const cashRequestsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    customerCashRequests: build.query<
      { requests: CashRequest[]; hasNextPage: boolean },
      { page: number; status?: string }
    >({
      query: (params) => ({ url: "/cash-requests", params, cache: "no-store" }),
      providesTags: ["CashRequests"],
      keepUnusedDataFor: 0,
    }),
    submitCashRequest: build.mutation<
      { request: CashRequest },
      CashRequestInput
    >({
      query: (body) => ({
        url: "/cash-requests",
        method: "POST",
        body,
        timeout: 15_000,
      }),
      invalidatesTags: (result) => (result ? ["CashRequests"] : []),
    }),
    cashReviewQueue: build.query<
      { requests: ReviewCashRequest[]; hasNextPage: boolean },
      { page: number; type?: string; status?: string }
    >({
      query: (params) => ({ url: "/cash-requests", params, cache: "no-store" }),
      providesTags: ["CashRequests"],
      keepUnusedDataFor: 0,
    }),
    cashRequestReview: build.query<{ request: ReviewCashRequest }, string>({
      query: (id) => ({
        url: `/cash-requests/${encodeURIComponent(id)}`,
        cache: "no-store",
      }),
      providesTags: ["CashRequests"],
      keepUnusedDataFor: 0,
    }),
    decideCashRequest: build.mutation<
      { request: CashRequest },
      CashDecision & { id: string }
    >({
      query: (input) => ({
        url: `/cash-requests/${encodeURIComponent(input.id)}/${input.action}`,
        method: "POST",
        body: input.action === "reject" ? { reason: input.reason } : {},
        timeout: 15_000,
      }),
      invalidatesTags: (result) => {
        if (!result) return [];
        return result.request.status === "APPROVED"
          ? [
              "CashRequests",
              "OwnedAccounts",
              "Management",
              "OnboardingAccounts",
              "Transactions",
            ]
          : ["CashRequests"];
      },
    }),
  }),
});

export const {
  useCustomerCashRequestsQuery,
  useSubmitCashRequestMutation,
  useCashReviewQueueQuery,
  useCashRequestReviewQuery,
  useDecideCashRequestMutation,
} = cashRequestsApi;
