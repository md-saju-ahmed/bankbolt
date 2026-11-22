import { baseApi } from "@/lib/api/base-api";

export const transactionTypes = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  FUND_TRANSFER: "Fund transfer",
  TRANSFER_REVERSAL: "Transfer reversal",
  LOAN_DISBURSEMENT: "Loan disbursement",
  LOAN_REPAYMENT: "Loan repayment",
};
export const transactionStatuses = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  FAILED: "Failed",
  REVERSED: "Reversed",
};

export type HistoryFilters = {
  page: number;
  reference?: string;
  from?: string;
  to?: string;
  type?: string;
  status?: string;
};

export type Transaction = {
  reference: string;
  senderNumber: string | null;
  receiverNumber: string | null;
  direction: "INCOMING" | "OUTGOING" | "INTERNAL" | null;
  type: keyof typeof transactionTypes;
  status: keyof typeof transactionStatuses;
  amountPoisha: string;
  feePoisha: string;
  description: string;
  createdAt: string;
  originalReference: string | null;
  reversalReference: string | null;
  reversalReason?: string | null;
  refundedFeePoisha: string;
};

export const transactionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    reverseTransfer: build.mutation<
      { reversalReference: string },
      { reference: string; reason: string }
    >({
      query: ({ reference, reason }) => ({
        url: `/transactions/${encodeURIComponent(reference)}/reverse`,
        method: "POST",
        body: { reason },
        timeout: 15_000,
      }),
      invalidatesTags: [
        "Transactions",
        "Management",
        "OwnedAccounts",
        "OnboardingAccounts",
      ],
    }),
    transactionHistory: build.query<
      { transactions: Transaction[]; hasNextPage: boolean },
      HistoryFilters & { customerId?: string }
    >({
      query: (params) => ({ url: "/transactions", params, cache: "no-store" }),
      providesTags: ["Transactions"],
      keepUnusedDataFor: 0,
    }),
    transactionDetail: build.query<
      { transaction: Transaction },
      { reference: string; receipt: boolean }
    >({
      query: ({ reference, receipt }) => ({
        url: `/transactions/${encodeURIComponent(reference)}${receipt ? "/receipt" : ""}`,
        cache: "no-store",
      }),
      providesTags: ["Transactions"],
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useTransactionHistoryQuery,
  useTransactionDetailQuery,
  useReverseTransferMutation,
} = transactionsApi;
