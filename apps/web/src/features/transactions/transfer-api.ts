import { baseApi } from "@/lib/api/base-api";
import type { Transaction } from "./transactions-api";

export type QuoteInput = {
  sourceAccountId: string;
  recipientAccountNumber: string;
  amountPoisha: string;
};
export type Quote = Omit<QuoteInput, "sourceAccountId"> & {
  sourceAccountNumber: string;
  feePoisha: string;
  totalDebitPoisha: string;
};
export type TransferDraft = QuoteInput & { description: string };
export type Transfer = Omit<Quote, "sourceAccountNumber"> &
  Pick<Transaction, "reference" | "createdAt" | "description" | "status">;
const affected = [
  "OwnedAccounts",
  "Transactions",
  "Management",
  "OnboardingAccounts",
] as const;

export const transferApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    transactionPinStatus: build.query<{ configured: boolean }, void>({
      query: () => ({ url: "/auth/transaction-pin", cache: "no-store" }),
      providesTags: ["TransactionPin"],
      keepUnusedDataFor: 0,
    }),
    changeTransactionPin: build.mutation<
      void,
      { password: string; currentPin?: string; newPin: string }
    >({
      query: (body) => ({ url: "/auth/transaction-pin", method: "PUT", body }),
      invalidatesTags: (_, error) => (error ? [] : ["TransactionPin"]),
    }),
    transferQuote: build.mutation<{ quote: Quote }, QuoteInput>({
      query: (body) => ({
        url: "/transfers/quote",
        method: "POST",
        body,
        timeout: 12_000,
      }),
    }),
    submitTransfer: build.mutation<
      { transfer: Transfer },
      TransferDraft & { pin: string; idempotencyKey: string }
    >({
      query: (body) => ({
        url: "/transfers",
        method: "POST",
        body,
        timeout: 15_000,
      }),
      invalidatesTags: (data) => (data ? affected : []),
    }),
    recoverTransfer: build.mutation<{ transfer: Transfer }, string>({
      query: (key) => ({
        url: `/transfers/by-key/${encodeURIComponent(key)}`,
        cache: "no-store",
        timeout: 12_000,
      }),
      invalidatesTags: (data) => (data ? affected : []),
    }),
  }),
});

export const {
  useTransactionPinStatusQuery,
  useChangeTransactionPinMutation,
  useTransferQuoteMutation,
  useSubmitTransferMutation,
  useRecoverTransferMutation,
} = transferApi;
