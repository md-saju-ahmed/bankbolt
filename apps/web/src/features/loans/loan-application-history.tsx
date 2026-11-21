"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTaka } from "@/features/accounts/account-display";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { historyLink } from "@/features/transactions/transaction-display";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import { loanLabels, loanStatuses, useCustomerLoansQuery } from "./loans-api";

const statusStyles = {
  PENDING: "bg-amber-50 text-amber-800",
  UNDER_REVIEW: "bg-blue-50 text-blue-800",
  APPROVED: "bg-emerald-50 text-emerald-800",
  REJECTED: "bg-red-50 text-red-800",
  ACTIVE: "bg-teal-50 text-teal-800",
  COMPLETED: "bg-slate-100 text-slate-700",
};

export function LoanApplicationHistory() {
  const [page, setPage] = useState(1);
  const query = useCustomerLoansQuery(page, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const loans = query.currentData?.loans ?? [];
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Loans</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Apply for a simulated loan and track its status.
          </p>
        </div>
        <Link
          href="/customer/loans/apply"
          className={`${historyLink} ${primaryStyle}`}
        >
          Apply for a loan
        </Link>
      </header>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 className="text-lg font-semibold">Your applications</h2>
          <Button
            className={secondaryStyle}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </Button>
        </div>
        {query.isFetching && (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Loading loan applications…
          </p>
        )}
        {query.isError ? (
          <div className="space-y-2 p-4">
            <ErrorMessage message="Could not load loan applications." />
            <Button
              className={secondaryStyle}
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          query.currentData && (
            <>
              {loans.length ? (
                <ul className="divide-y">
                  {loans.map((loan) => (
                    <li key={loan.id} className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold">
                            {loanLabels[loan.type]} loan
                          </h3>
                          <p className="mt-1 text-sm font-medium tabular-nums">
                            {formatTaka(loan.requestedPrincipalPoisha)} ·{" "}
                            {loan.termMonths} months
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[loan.status]}`}
                        >
                          {loanStatuses[loan.status]}
                        </span>
                      </div>
                      <p className="mt-2 break-words text-sm">
                        {loan.description}
                      </p>
                      {loan.rejectionReason && (
                        <p className="mt-2 break-words text-sm text-muted-foreground">
                          Reason for rejection: {loan.rejectionReason}
                        </p>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        Submitted{" "}
                        <time dateTime={loan.createdAt}>
                          {formatDhakaTimestamp(loan.createdAt)}
                        </time>{" "}
                        (Dhaka)
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  You have no loan applications yet.
                </p>
              )}
              {(page > 1 || query.currentData.hasNextPage) && (
                <div className="border-t p-4">
                  <Pager
                    page={page}
                    next={query.currentData.hasNextPage}
                    onPage={setPage}
                  />
                </div>
              )}
            </>
          )
        )}
      </Card>
    </section>
  );
}
