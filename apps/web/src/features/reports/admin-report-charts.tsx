"use client";

import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { accountTypes, formatTaka } from "@/features/accounts/account-display";
import { formatDhakaDay } from "@/lib/dhaka-date";
import { cn } from "@/lib/utils";
import styles from "./admin-overview.module.css";
import type { AdminReport, AdminReportMonth } from "./reports-api";

type FlowKey = Exclude<
  keyof AdminReportMonth,
  "month" | "completedTransactions"
>;
type Series<Key extends FlowKey | "count" = FlowKey | "count"> = {
  key: Key;
  label: string;
  color: string;
  striped?: boolean;
};
type Point = {
  label: string;
  tick: string;
  exact: Record<string, string | number>;
  plot: Record<string, number>;
};

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
    color: "var(--brand-accent)",
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
const numeric = new Intl.NumberFormat("en-IN");
const compact = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const shortMonth = new Intl.DateTimeFormat("en-BD", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const fullMonth = new Intl.DateTimeFormat("en-BD", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const tickStyle = { fill: "var(--muted-foreground)", fontSize: 12 };

function monthlyPoints(months: AdminReportMonth[]): Point[] {
  const fields = [volume, ...activity].map(({ key }) => key);
  return months.map((row) => {
    const date = new Date(`${row.month}-01T00:00:00Z`);
    return {
      label: fullMonth.format(date),
      tick: shortMonth.format(date),
      exact: Object.fromEntries(fields.map((key) => [key, row[key]])),
      // Recharts needs numbers for coordinates. Tables and tooltips use the original poisha strings.
      plot: Object.fromEntries(
        fields.map((key) => [key, Number(row[key]) / 100]),
      ),
    };
  });
}

function category(label: string, count: number): Point {
  return { label, tick: label, exact: { count }, plot: { count } };
}

function exactValue(value: string | number) {
  return typeof value === "string" ? formatTaka(value) : numeric.format(value);
}

function ChartData({
  title,
  points,
  series,
  byMonth,
}: {
  title: string;
  points: Point[];
  series: Series[];
  byMonth: boolean;
}) {
  return (
    <details className="mt-4 border-t">
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        View data table<span className="sr-only"> for {title}</span>
      </summary>
      <div
        className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        role="region"
        aria-label={`${title} data table`}
        tabIndex={0}
      >
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 text-start">
                {byMonth ? "Month" : "Category"}
              </th>
              {series.map((entry) => (
                <th key={entry.key} scope="col" className="px-3 py-2 text-end">
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {points.map((point) => (
              <tr key={point.label}>
                <th
                  scope="row"
                  className="px-3 py-2 text-start whitespace-nowrap font-medium"
                >
                  {point.label}
                </th>
                {series.map((entry) => (
                  <td
                    key={entry.key}
                    className="px-3 py-2 text-end whitespace-nowrap tabular-nums"
                  >
                    {exactValue(point.exact[entry.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function SeriesLegend({ series }: { series: Series[] }) {
  return (
    <ul
      aria-label="Chart legend"
      className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm"
    >
      {series.map((entry) => (
        <li key={entry.key} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-xs border border-foreground/25"
            style={{
              backgroundColor: entry.color,
              backgroundImage: entry.striped
                ? "repeating-linear-gradient(135deg, transparent 0 3px, var(--card) 3px 4px)"
                : undefined,
            }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

function ReportChart({
  title,
  description,
  points,
  series,
  emptyMessage,
  byMonth = false,
  stacked = false,
}: {
  title: string;
  description: string;
  points: Point[];
  series: Series[];
  emptyMessage: string;
  byMonth?: boolean;
  stacked?: boolean;
}) {
  const id = useId();
  const hasData = points.some((point) =>
    series.some(({ key }) => point.plot[key] > 0),
  );
  const height = byMonth ? 218 : 158;
  const countMax = byMonth
    ? 0
    : Math.max(1, ...points.map((point) => point.plot.count));

  return (
    <Card
      role="region"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      className={cn("min-w-0 p-4 sm:p-5", stacked && "col-span-full")}
    >
      <h3 id={`${id}-title`} className="text-base font-semibold">
        {title}
      </h3>
      <p
        id={`${id}-description`}
        className="mt-1 text-sm text-muted-foreground"
      >
        {description}
      </p>
      {hasData ? (
        <>
          <div className={cn("mt-4 min-w-0", styles.plot)}>
            <ResponsiveContainer width="100%" height={height} minWidth={0}>
              <BarChart
                data={points}
                layout={byMonth ? "horizontal" : "vertical"}
                title={title}
                desc={description}
                accessibilityLayer
                margin={{ top: 5, right: 9, bottom: 0, left: 0 }}
              >
                <defs>
                  {series
                    .filter((entry) => entry.striped)
                    .map((entry) => (
                      <pattern
                        key={entry.key}
                        id={`${id}-${entry.key}`}
                        patternUnits="userSpaceOnUse"
                        width={6}
                        height={6}
                        patternTransform="rotate(45)"
                      >
                        <rect width={6} height={6} fill={entry.color} />
                        <path
                          d="M 0 0 V 6"
                          stroke="var(--card)"
                          strokeWidth={1.5}
                        />
                      </pattern>
                    ))}
                </defs>
                <CartesianGrid
                  stroke="var(--border)"
                  vertical={!byMonth}
                  horizontal={byMonth}
                />
                {byMonth ? (
                  <>
                    <XAxis
                      dataKey="tick"
                      tick={tickStyle}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={15}
                      interval="preserveStartEnd"
                      tickMargin={9}
                    />
                    <YAxis
                      tick={tickStyle}
                      axisLine={false}
                      tickLine={false}
                      tickCount={5}
                      width={56}
                      tickFormatter={(value: number) => compact.format(value)}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      type="number"
                      tick={tickStyle}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      domain={[0, countMax]}
                      ticks={
                        countMax <= 5
                          ? Array.from(
                              { length: countMax + 1 },
                              (_, count) => count,
                            )
                          : undefined
                      }
                      tickFormatter={(value: number) => compact.format(value)}
                    />
                    <YAxis
                      type="category"
                      dataKey="tick"
                      tick={tickStyle}
                      axisLine={false}
                      tickLine={false}
                      width={76}
                    />
                  </>
                )}
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as Point | undefined;
                    if (!active || !point) return null;
                    return (
                      <div
                        className="max-w-[min(15rem,72vw)] rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-sm"
                        role="status"
                      >
                        <p className="font-semibold">{point.label}</p>
                        <dl className="mt-2 space-y-1">
                          {series.map((entry) => (
                            <div
                              key={entry.key}
                              className="flex flex-wrap justify-between gap-x-3"
                            >
                              <dt>{entry.label}</dt>
                              <dd className="min-w-0 font-medium break-words tabular-nums">
                                {exactValue(point.exact[entry.key])}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    );
                  }}
                />
                {series.map((entry) => (
                  <Bar
                    key={entry.key}
                    dataKey={`plot.${entry.key}`}
                    name={entry.label}
                    fill={
                      entry.striped ? `url(#${id}-${entry.key})` : entry.color
                    }
                    stroke={entry.striped ? entry.color : undefined}
                    maxBarSize={byMonth ? 34 : 24}
                    stackId={stacked ? "activity" : undefined}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {series.length > 1 && <SeriesLegend series={series} />}
        </>
      ) : (
        <p className="mt-4 rounded-md bg-muted p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      )}
      <ChartData
        title={title}
        points={points}
        series={series}
        byMonth={byMonth}
      />
    </Card>
  );
}

export function AdminReportCharts({ report }: { report: AdminReport }) {
  const monthly = monthlyPoints(report.monthly);
  const period = (day: string) => formatDhakaDay(`${day}T12:00:00+06:00`);
  return (
    <section aria-labelledby="banking-charts">
      <h2 id="banking-charts" className="text-lg font-semibold">
        Banking analytics
      </h2>
      <p className="mt-1 mb-3 text-sm text-muted-foreground">
        <time dateTime={report.period.from}>{period(report.period.from)}</time>
        {" to "}
        <time dateTime={report.period.to}>{period(report.period.to)}</time>
        {" (Asia/Dhaka)"}
      </p>
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
