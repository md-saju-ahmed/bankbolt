import { baseApi } from "@/lib/api/base-api";
import type { Transaction } from "./transactions-api";

export type FlagStatus = "OPEN" | "RESOLVED";
export type Flag = {
  id: string;
  reference: string;
  type: Transaction["type"];
  amountPoisha: string;
  status: FlagStatus;
  reason: string;
  createdAt: string;
  reporterName: string;
  resolvedAt: string | null;
  resolverName: string | null;
  resolutionNote: string | null;
};
type FlagPage = { flags: Flag[]; hasNextPage: boolean };

const flagsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    flagQueue: build.query<
      FlagPage,
      { workspace: "admin" | "staff"; page: number; status?: FlagStatus }
    >({
      query: ({ workspace, ...params }) => ({
        url:
          workspace === "staff"
            ? "/transaction-flags/mine"
            : "/transaction-flags",
        params,
        cache: "no-store",
      }),
      providesTags: ["TransactionFlags"],
      keepUnusedDataFor: 0,
    }),
    relatedFlags: build.query<FlagPage, { reference: string; page: number }>({
      query: ({ reference, page }) => ({
        url: `/transactions/${encodeURIComponent(reference)}/flags`,
        params: { page },
        cache: "no-store",
      }),
      providesTags: ["TransactionFlags"],
      keepUnusedDataFor: 0,
    }),
    flagTransaction: build.mutation<
      { flag: { id: string } },
      { reference: string; reason: string }
    >({
      query: ({ reference, reason }) => ({
        url: `/transactions/${encodeURIComponent(reference)}/flag`,
        method: "POST",
        body: { reason },
        timeout: 12_000,
      }),
      invalidatesTags: ["TransactionFlags"],
    }),
    resolveTransactionFlag: build.mutation<
      { flag: { id: string } },
      { id: string; note?: string }
    >({
      query: ({ id, note }) => ({
        url: `/transaction-flags/${encodeURIComponent(id)}/resolve`,
        method: "POST",
        body: note ? { note } : {},
        timeout: 12_000,
      }),
      invalidatesTags: ["TransactionFlags"],
    }),
  }),
});

export const {
  useFlagQueueQuery,
  useRelatedFlagsQuery,
  useFlagTransactionMutation,
  useResolveTransactionFlagMutation,
} = flagsApi;
