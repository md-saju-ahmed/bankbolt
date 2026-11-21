"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ErrorMessage,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { historyLink } from "@/features/transactions/transaction-display";
import { cn } from "@/lib/utils";
import styles from "./staff-overview.module.css";
import { useStaffReportQuery, type StaffReport } from "./reports-api";

const number = new Intl.NumberFormat("en-BD");

function QueueRow({
  title,
  total,
  action,
  href,
  children,
}: {
  title: string;
  total: number;
  action: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <li className={cn(styles.queueRow, "p-4 sm:p-5")}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-2xl font-semibold break-words tabular-nums">
          {number.format(total)}
        </p>
      </div>
      <div className="min-w-0 text-sm text-muted-foreground">{children}</div>
      <Link href={href} className={`${historyLink} ${secondaryStyle} w-fit`}>
        {action}
      </Link>
    </li>
  );
}

function WorkQueues({ report }: { report: StaffReport }) {
  const {
    pendingCashRequests: cash,
    loanReview: loans,
    openTransactionFlags: flags,
  } = report;
  return (
    <ul className="divide-y">
      <QueueRow
        title="Pending cash requests"
        total={cash.total}
        href="/staff/cash-requests"
        action="Open cash queue"
      >
        {cash.total ? (
          <p>
            {number.format(cash.deposits)}{" "}
            {cash.deposits === 1 ? "deposit" : "deposits"},{" "}
            {number.format(cash.withdrawals)}{" "}
            {cash.withdrawals === 1 ? "withdrawal" : "withdrawals"}
          </p>
        ) : (
          <p>No cash requests to review.</p>
        )}
      </QueueRow>
      <QueueRow
        title="Loans awaiting Staff review"
        total={loans.actionable}
        href="/staff/loans"
        action="Open loan queue"
      >
        {loans.actionable ? (
          <p>
            {number.format(loans.pending)} pending,{" "}
            {number.format(loans.underReview)} under review
          </p>
        ) : (
          <p>No loans to review.</p>
        )}
        <p className="mt-1">
          {number.format(loans.forwarded)} forwarded to Admin
        </p>
      </QueueRow>
      <QueueRow
        title="My open transaction flags"
        total={flags}
        href="/staff/transaction-flags"
        action="View my flags"
      >
        <p>{flags ? "Waiting for Admin review." : "You have no open flags."}</p>
      </QueueRow>
    </ul>
  );
}

export function StaffOverview() {
  const query = useStaffReportQuery(undefined, {
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
  });
  const report = query.isError ? undefined : query.currentData;

  return (
    <section className={cn(styles.overview, "space-y-5")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-3xl font-semibold tracking-tight break-words">
          Staff overview
        </h1>
        <nav aria-label="Staff shortcuts" className="flex flex-wrap gap-2">
          <Link
            className={cn(historyLink, primaryStyle, "px-3 sm:px-4")}
            href="/staff/onboarding?mode=register"
          >
            Register customer
          </Link>
          <Link
            className={cn(historyLink, secondaryStyle, "px-3 sm:px-4")}
            href="/staff/transactions"
          >
            Search transactions
          </Link>
        </nav>
      </header>
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Work queues</h2>
          <Button
            disabled={query.isFetching}
            className={secondaryStyle}
            onClick={() => void query.refetch()}
          >
            {query.isError ? "Try again" : "Refresh queues"}
          </Button>
        </div>
        {query.isFetching && (
          <p
            role="status"
            className="px-4 pt-3 text-sm text-muted-foreground sm:px-5"
          >
            {report ? "Refreshing queues…" : "Loading queues…"}
          </p>
        )}
        {query.isError && (
          <div className="p-4 sm:p-5">
            <ErrorMessage
              message={onboardingError(
                query.error,
                "Could not load work queues. Try again.",
              )}
            />
          </div>
        )}
        <div aria-busy={query.isFetching}>
          {report ? (
            <WorkQueues report={report} />
          ) : (
            query.isFetching && (
              <div aria-hidden="true" className="space-y-4 p-4 sm:p-5">
                <div className="h-14 rounded-md bg-muted" />
                <div className="h-14 rounded-md bg-muted" />
                <div className="h-14 rounded-md bg-muted" />
              </div>
            )
          )}
        </div>
      </Card>
    </section>
  );
}
