"use client";

import { accountTypes } from "@/features/accounts/account-display";
import styles from "./admin-overview.module.css";
import {
  category,
  ChartPeriod,
  monthlyPoints,
  ReportChart,
  type Series,
} from "./report-chart";
import type { AdminReport, AdminReportMonth } from "./reports-api";

type FlowKey = Exclude<
  keyof AdminReportMonth,
  "month" | "completedTransactions"
>;
const volume: Series<FlowKey> = {
  key: "transactionVolumePoisha",
  label: "Transaction volume",
  color: "var(--primary)",
};
const cashFlow: Series<FlowKey>[] = [
  { key: "depositsPoisha", label: "Deposits", color: "var(--primary)" },
  {
    key: "withdrawalsPoisha",
    label: "Withdrawals",
    color: "var(--chart-withdrawal)",
    striped: true,
  },
];
const activity: Series<FlowKey>[] = [
  ...cashFlow,
  {
    key: "transfersPoisha",
    label: "Fund transfers",
    color: "var(--foreground)",
  },
  {
    key: "loanDisbursementsPoisha",
    label: "Loan disbursements",
    color: "var(--brand)",
    striped: true,
  },
  {
    key: "loanRepaymentsPoisha",
    label: "Loan repayments",
    color: "var(--muted-foreground)",
    striped: true,
  },
];
const accounts: Series = {
  key: "count",
  label: "Accounts",
  color: "var(--primary)",
};
const decisions: Series = {
  key: "count",
  label: "Decisions",
  color: "var(--primary)",
};
export function AdminReportCharts({ report }: { report: AdminReport }) {
  const monthly = monthlyPoints(
    report.monthly,
    [volume, ...activity].map(({ key }) => key),
  );
  return (
    <section aria-labelledby="banking-charts">
      <h2 id="banking-charts" className="text-lg font-semibold">
        Banking analytics
      </h2>
      <ChartPeriod period={report.period} />
      <div className={styles.chartGrid}>
        <ReportChart
          title="Monthly transaction volume"
          description="Amount of completed transactions in BDT."
          points={monthly}
          series={[volume]}
          emptyMessage="No completed transactions in this period."
          byMonth
        />
        <ReportChart
          title="Deposits vs withdrawals"
          description="Completed deposits and withdrawals by month, in BDT."
          points={monthly}
          series={cashFlow}
          emptyMessage="No completed deposits or withdrawals in this period."
          byMonth
        />
        <ReportChart
          title="Account distribution"
          description="Current bank accounts by type, across all statuses."
          points={report.accountDistribution.map(({ type, count }) =>
            category(accountTypes[type], count),
          )}
          series={[accounts]}
          emptyMessage="No bank accounts yet."
        />
        <ReportChart
          title="Loan approval statistics"
          description="Applications approved or rejected during the selected period."
          points={[
            category("Approved", report.loanDecisions.approved),
            category("Rejected", report.loanDecisions.rejected),
          ]}
          series={[decisions]}
          emptyMessage="No loan decisions in this period."
        />
        <ReportChart
          title="Monthly banking activity"
          description="Completed amounts by transaction type and month, in BDT."
          points={monthly}
          series={activity}
          emptyMessage="No completed banking activity in this period."
          byMonth
          stacked
        />
      </div>
    </section>
  );
}
