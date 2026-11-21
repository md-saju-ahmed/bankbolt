import { baseApi } from "@/lib/api/base-api";
import type { AccountType } from "@/features/onboarding/onboarding-api";

export type ReportDates = { from: string; to: string };

export type AdminReportMonth = {
  month: string;
  completedTransactions: number;
  transactionVolumePoisha: string;
  depositsPoisha: string;
  withdrawalsPoisha: string;
  transfersPoisha: string;
  loanDisbursementsPoisha: string;
  loanRepaymentsPoisha: string;
};

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
  monthly: AdminReportMonth[];
  accountDistribution: { type: AccountType; count: number }[];
  loanDecisions: { approved: number; rejected: number };
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
