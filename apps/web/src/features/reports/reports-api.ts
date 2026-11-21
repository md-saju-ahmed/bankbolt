import { baseApi } from "@/lib/api/base-api";

export type ReportDates = { from: string; to: string };

export type AdminReport = {
  period: ReportDates & { timeZone: "Asia/Dhaka" };
  summary: {
    customerCount: number;
    accountCount: number;
    balancePoisha: string;
    completedTransactions: number;
    depositsPoisha: string;
    withdrawalsPoisha: string;
    pendingLoanApplications: number;
    openTransactionFlags: number;
  };
  loanQueue: { pending: number; underReview: number; forwarded: number };
};

const reportsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    adminReport: build.query<AdminReport, ReportDates | void>({
      query: (params) => ({
        url: "/reports/admin",
        params: params ?? undefined,
        cache: "no-store",
        timeout: 15_000,
      }),
      providesTags: [
        "Management",
        "OnboardingAccounts",
        "OwnedAccounts",
        "Transactions",
        "Loans",
        "TransactionFlags",
      ],
      keepUnusedDataFor: 0,
    }),
  }),
});

export const { useAdminReportQuery } = reportsApi;
