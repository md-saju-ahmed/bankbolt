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
  }),
});

export const { useCustomerCashRequestsQuery, useSubmitCashRequestMutation } =
  cashRequestsApi;
