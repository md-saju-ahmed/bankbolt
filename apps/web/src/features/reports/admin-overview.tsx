"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ListSkeleton,
  LoadingRegion,
  Skeleton,
} from "@/components/ui/skeleton";
import { formatTaka } from "@/features/accounts/account-display";
import {
  ErrorMessage,
  Field,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { historyLink } from "@/features/transactions/transaction-display";
import { formatDhakaDay } from "@/lib/dhaka-date";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import styles from "./admin-overview.module.css";
import { ReportChartsSkeleton } from "./report-skeleton";
import {
  useAdminReportQuery,
  type AdminReport,
  type ReportDates,
} from "./reports-api";

const countFormat = new Intl.NumberFormat("en-BD");
const AdminReportCharts = dynamic(
  () =>
    import("./admin-report-charts").then((module) => module.AdminReportCharts),
  {
    ssr: false,
    loading: () => <ReportChartsSkeleton gridClassName={styles.chartGrid} />,
  },
);
const emptyDates = { from: "", to: "" };
const textLink =
  "inline-flex min-h-11 w-fit items-center rounded-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function periodError(dates: ReportDates) {
  const { from, to } = dates;
  const supportedDate = /^\d{4}-\d{2}-\d{2}$/;
  if (
    ![from, to].every(
      (value) => supportedDate.test(value) && value >= "0001-01-01",
    )
  )
    return "Enter a start and end date.";
  if (from > to) return "The start date must be on or before the end date.";
  const monthIndex = (day: string) =>
    Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));
  return monthIndex(to) - monthIndex(from) < 24
    ? ""
    : "Choose a period of up to 24 calendar months.";
}

function CurrentTotals({ summary }: { summary: AdminReport["summary"] }) {
  return (
    <Card className="flex min-w-0 flex-col justify-between border-navy bg-navy p-4 text-navy-foreground sm:p-5">
      <h2 className="text-base font-semibold">Current bank totals</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
        <div className="col-span-2 min-w-0 border-b border-navy-foreground/20 pb-4">
          <dt className="text-sm text-navy-foreground/80">
            Total bank balance
          </dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight break-words tabular-nums sm:text-4xl">
            {formatTaka(summary.balancePoisha)}
          </dd>
        </div>
        <div className="row-span-2 grid min-w-0 grid-rows-subgrid gap-y-1">
          <dt className="text-sm text-navy-foreground/80">
            Registered customers
          </dt>
          <dd>
            <span className="block text-xl font-semibold break-words tabular-nums">
              {countFormat.format(summary.customerCount)}
            </span>
            <Link
              className={`${textLink} text-sm text-brand-accent focus-visible:outline-brand-accent`}
              href="/admin/management/customers"
            >
              Manage customers
            </Link>
          </dd>
        </div>
        <div className="row-span-2 grid min-w-0 grid-rows-subgrid gap-y-1">
          <dt className="text-sm text-navy-foreground/80">Bank accounts</dt>
          <dd>
            <span className="block text-xl font-semibold break-words tabular-nums">
              {countFormat.format(summary.accountCount)}
            </span>
            <Link
              className={`${textLink} text-sm text-brand-accent focus-visible:outline-brand-accent`}
              href="/admin/management/accounts"
            >
              Manage accounts
            </Link>
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function CompletedActivity({ report }: { report: AdminReport }) {
  const { period, summary } = report;
  const activity = [
    { label: "Total deposits", value: formatTaka(summary.depositsPoisha) },
    {
      label: "Total withdrawals",
      value: formatTaka(summary.withdrawalsPoisha),
    },
    {
      label: "Completed transactions",
      value: countFormat.format(summary.completedTransactions),
    },
  ];
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <h2 className="text-base font-semibold">Completed activity</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <time dateTime={period.from}>
          {formatDhakaDay(`${period.from}T12:00:00+06:00`)}
        </time>
        {" to "}
        <time dateTime={period.to}>
          {formatDhakaDay(`${period.to}T12:00:00+06:00`)}
        </time>
      </p>
      <dl className="mt-3 divide-y">
        {activity.map(({ label, value }) => (
          <div
            key={label}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 last:pb-0"
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-xl font-semibold break-words tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {summary.completedTransactions === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          No completed transactions in this period.
        </p>
      )}
    </Card>
  );
}

function ReviewQueues({ report }: { report: AdminReport }) {
  const { summary, loanQueue } = report;
  return (
    <section aria-labelledby="review-queues">
      <h2 id="review-queues" className="mb-3 text-lg font-semibold">
        Review queues
      </h2>
      <div className={styles.queueGrid}>
        <Card className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 sm:p-5">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Pending loan applications</h3>
            <p className="mt-1 text-2xl font-semibold break-words tabular-nums">
              {countFormat.format(summary.pendingLoanApplications)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {countFormat.format(loanQueue.forwarded)} forwarded for approval
            </p>
          </div>
          <Link
            className={`${historyLink} ${secondaryStyle}`}
            href="/admin/loans"
          >
            Open loan queue
          </Link>
        </Card>
        <Card className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 sm:p-5">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Open transaction flags</h3>
            <p className="mt-1 text-2xl font-semibold break-words tabular-nums">
              {countFormat.format(summary.openTransactionFlags)}
            </p>
          </div>
          <Link
            className={`${historyLink} ${secondaryStyle}`}
            href="/admin/transaction-flags"
          >
            Open flag queue
          </Link>
        </Card>
      </div>
    </section>
  );
}

export function AdminOverview() {
  const router = useRouter();
  const params = useSearchParams();
  const period =
    params.has("from") || params.has("to")
      ? { from: params.get("from") ?? "", to: params.get("to") ?? "" }
      : undefined;
  const periodKey = params.toString();
  const [navigating, navigate] = useTransition();
  const [edit, setEdit] = useState<{
    periodKey: string;
    dates: ReportDates;
    error: string;
  }>();
  const query = useAdminReportQuery(period, {
    refetchOnMountOrArgChange: true,
  });
  const report = query.isError ? undefined : query.currentData;
  const activeEdit = edit?.periodKey === periodKey ? edit : undefined;
  const dates = activeEdit?.dates ?? period ?? report?.period ?? emptyDates;
  const busy = navigating || query.isFetching;

  function changeDate(field: keyof ReportDates, value: string) {
    setEdit({ periodKey, dates: { ...dates, [field]: value }, error: "" });
  }

  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = periodError(dates);
    if (error) {
      setEdit({ periodKey, dates, error });
      return;
    }
    setEdit(undefined);
    if (dates.from === period?.from && dates.to === period.to) {
      void query.refetch();
    } else {
      const next = new URLSearchParams({ from: dates.from, to: dates.to });
      navigate(() =>
        router.push(`/admin?${next.toString()}`, { scroll: false }),
      );
    }
  }

  function resetPeriod() {
    setEdit(undefined);
    if (period) navigate(() => router.push("/admin", { scroll: false }));
  }

  return (
    <section className={cn(styles.overview, "space-y-5")}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h1 className="min-w-0 text-3xl font-semibold tracking-tight break-words">
          Banking overview
        </h1>
        <Button
          className={secondaryStyle}
          disabled={busy}
          onClick={() => void query.refetch()}
        >
          {query.isError ? "Try again" : "Refresh overview"}
        </Button>
      </header>
      <form
        aria-label="Reporting period"
        className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
        onSubmit={applyPeriod}
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Reporting period</h2>
          <p id="report-timezone" className="text-xs text-muted-foreground">
            Dates use Dhaka time.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <Field
            label="From"
            type="date"
            required
            value={dates.from}
            onChange={(event) => changeDate("from", event.target.value)}
            className="min-w-0"
            aria-invalid={Boolean(activeEdit?.error)}
            aria-describedby={
              activeEdit?.error
                ? "report-period-error report-timezone"
                : "report-timezone"
            }
          />
          <Field
            label="Through"
            type="date"
            required
            value={dates.to}
            onChange={(event) => changeDate("to", event.target.value)}
            className="min-w-0"
            aria-invalid={Boolean(activeEdit?.error)}
            aria-describedby={
              activeEdit?.error
                ? "report-period-error report-timezone"
                : "report-timezone"
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button className={primaryStyle} type="submit" disabled={busy}>
              Apply period
            </Button>
            {(period || activeEdit) && (
              <Button
                className={secondaryStyle}
                disabled={busy}
                onClick={resetPeriod}
              >
                Reset period
              </Button>
            )}
          </div>
        </div>
        {activeEdit?.error && (
          <div id="report-period-error">
            <ErrorMessage message={activeEdit.error} />
          </div>
        )}
      </form>

      {query.isError && (
        <ErrorMessage
          message={onboardingError(
            query.error,
            "Could not load the overview. Try again or reset the reporting period.",
          )}
        />
      )}
      <div className="space-y-5" aria-busy={busy && !!report}>
        {report ? (
          <>
            <div className={styles.metricsGrid}>
              <CurrentTotals summary={report.summary} />
              <CompletedActivity report={report} />
            </div>
            <ReviewQueues report={report} />
            <AdminReportCharts report={report} />
          </>
        ) : (
          !query.isError &&
          busy && (
            <>
              <LoadingRegion label="Loading bank overview">
                <div className={styles.metricsGrid}>
                  <Card className="min-h-64 border-navy bg-navy p-4 sm:p-5">
                    <Skeleton className="h-5 w-40 bg-white/15" />
                    <Skeleton className="mt-5 h-4 w-28 bg-white/15" />
                    <Skeleton className="mt-2 h-10 w-2/3 bg-white/15" />
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
                      <Skeleton className="h-14 bg-white/15" />
                      <Skeleton className="h-14 bg-white/15" />
                    </div>
                  </Card>
                  <Card className="min-h-64 space-y-3 p-4 sm:p-5">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-5/6 max-w-64" />
                    <ListSkeleton
                      label="Loading completed activity"
                      rowClassName="px-0"
                    />
                  </Card>
                </div>
                <Skeleton className="mt-5 mb-3 h-7 w-36" />
                <div className={styles.queueGrid}>
                  <Skeleton className="min-h-28 rounded-xl" />
                  <Skeleton className="min-h-28 rounded-xl" />
                </div>
              </LoadingRegion>
              <ReportChartsSkeleton gridClassName={styles.chartGrid} />
            </>
          )
        )}
      </div>
    </section>
  );
}
