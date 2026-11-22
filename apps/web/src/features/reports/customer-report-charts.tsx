"use client";

import { transactionTypes } from "@/features/transactions/transactions-api";
import styles from "./customer-overview.module.css";
import {
  category,
  ChartPeriod,
  monthlyPoints,
  ReportChart,
  type Series,
} from "./report-chart";
import type { CustomerReport } from "./reports-api";

const spending: Series<"spendingPoisha"> = {
  key: "spendingPoisha",
  label: "Spending",
  color: "var(--primary)",
};
const deposits: Series<"depositsPoisha"> = {
  key: "depositsPoisha",
  label: "Deposits",
  color: "var(--primary)",
};
const transactionCount: Series<"count"> = {
  key: "count",
  label: "Transactions",
  color: "var(--primary)",
};
const transactionTicks = {
  DEPOSIT: "Deposits",
  WITHDRAWAL: "Withdrawals",
  FUND_TRANSFER: "Transfers",
  TRANSFER_REVERSAL: "Reversals",
  LOAN_DISBURSEMENT: "Loan payouts",
  LOAN_REPAYMENT: "Repayments",
};

export function CustomerReportCharts({
  report,
  scope,
}: {
  report: CustomerReport;
  scope: string;
}) {
  const monthly = monthlyPoints(report.monthly, [spending.key, deposits.key]);
  return (
    <section aria-labelledby="customer-analytics">
      <h2 id="customer-analytics" className="text-lg font-semibold">
        Activity breakdown
      </h2>
      <p className="mt-1 text-sm font-medium">{scope}</p>
      <ChartPeriod period={report.period} />
      <div className={styles.chartGrid}>
        <ReportChart
          title="Monthly spending"
          description="Completed cash withdrawals, external transfers and loan repayments, including fees, in BDT."
          points={monthly}
          series={[spending]}
          emptyMessage="No completed spending in this period."
          byMonth
        />
        <ReportChart
          title="Monthly deposit history"
          description="Completed cash deposits by month, in BDT."
          points={monthly}
          series={[deposits]}
          emptyMessage="No completed deposits in this period."
          byMonth
        />
        <ReportChart
          title="Transaction distribution"
          description="Completed transactions by type. Each transfer is counted once."
          points={report.transactionDistribution.map(({ type, count }) =>
            category(transactionTypes[type], count, transactionTicks[type]),
          )}
          series={[transactionCount]}
          emptyMessage="No completed transactions in this period."
          className="col-span-full"
        />
      </div>
    </section>
  );
}
