import { baseApi } from "@/lib/api/base-api";
import type { AccountType } from "@/features/onboarding/onboarding-api";
import type { Transaction } from "@/features/transactions/transactions-api";

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

export type CustomerReport = {
  period: ReportDates & { timeZone: "Asia/Dhaka" };
  accountId: string | null;
  summary: {
    accountCount: number;
    balancePoisha: string;
    depositsPoisha: string;
    withdrawalsPoisha: string;
    activeLoans: number;
    outstandingPrincipalPoisha: string;
  };
  recentTransactions: (Omit<
    Transaction,
    "senderNumber" | "receiverNumber" | "direction"
  > & {
    direction: NonNullable<Transaction["direction"]>;
  })[];
  monthly: { month: string; spendingPoisha: string; depositsPoisha: string }[];
  transactionDistribution: { type: Transaction["type"]; count: number }[];
};

export type StaffReport = {
  pendingCashRequests: { total: number; deposits: number; withdrawals: number };
  loanReview: {
    pending: number;
    underReview: number;
    forwarded: number;
    actionable: number;
  };
  openTransactionFlags: number;
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
    customerReport: build.query<CustomerReport, { accountId: string } | void>({
      query: (params) => ({
        url: "/reports/customer",
        params: params ?? undefined,
        cache: "no-store",
        timeout: 15_000,
      }),
      providesTags: ["OwnedAccounts", "Transactions", "Loans"],
      keepUnusedDataFor: 0,
    }),
    staffReport: build.query<StaffReport, void>({
      query: () => ({
        url: "/reports/staff",
        cache: "no-store",
        timeout: 15_000,
      }),
      providesTags: ["CashRequests", "Loans", "TransactionFlags"],
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useAdminReportQuery,
  useCustomerReportQuery,
  useStaffReportQuery,
} = reportsApi;
