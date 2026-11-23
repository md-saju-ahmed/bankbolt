"use client";

import Link from "next/link";
import { useDispatch } from "react-redux";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/skeleton";
import { formatTaka } from "@/features/accounts/account-display";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  fieldStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { historyLink } from "@/features/transactions/transaction-display";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import { useAppSelector } from "@/lib/store/provider";
import { loanLabels, loanStatuses, useLoanReviewQueueQuery } from "./loans-api";
import { loansSlice, type LoanQueue } from "./loans-slice";

const queues = {
  pending: { status: "PENDING" },
  reviewing: { status: "UNDER_REVIEW", forwarded: false },
  forwarded: { status: "UNDER_REVIEW", forwarded: true },
  approved: { status: "APPROVED" },
  rejected: { status: "REJECTED" },
  active: { status: "ACTIVE" },
  completed: { status: "COMPLETED" },
} as const;

export function LoanReviewQueue({
  workspace,
}: {
  workspace: "staff" | "admin";
}) {
  const dispatch = useDispatch();
  const { queue, page } = useAppSelector((state) => state.loans[workspace]);
  function select(nextQueue: LoanQueue, nextPage: number) {
    dispatch(
      loansSlice.actions.setReviewSelection({
        workspace,
        queue: nextQueue,
        page: nextPage,
      }),
    );
  }
  const query = useLoanReviewQueueQuery(
    { page, ...queues[queue] },
    { refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );
  const result = query.currentData;

  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Loan review</h1>
      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <label className="flex min-w-44 flex-col gap-1 text-sm font-medium">
            Review queue
            <select
              className={fieldStyle}
              value={queue}
              onChange={(event) => select(event.target.value as LoanQueue, 1)}
            >
              <option value="pending">Pending</option>
              <option value="reviewing">Under review</option>
              <option value="forwarded">Forwarded to Admin</option>
              {workspace === "admin" && (
                <>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </>
              )}
            </select>
          </label>
          <Button
            className={secondaryStyle}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isError ? "Try again" : "Refresh"}
          </Button>
        </div>
        {query.isFetching && !query.isError && !result && (
          <ListSkeleton label="Loading applications" />
        )}
        {query.isError ? (
          <div className="p-4">
            <ErrorMessage message="Could not load loan applications." />
          </div>
        ) : (
          result && (
            <>
              {result.loans.length ? (
                <ul className="divide-y">
                  {result.loans.map((loan) => (
                    <li
                      key={loan.id}
                      className="grid items-center gap-x-4 gap-y-2 p-4 lg:grid-cols-4"
                    >
                      <div className="min-w-0">
                        <h2 className="font-semibold">
                          {loanLabels[loan.type]} loan
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          ID ending {loan.id.slice(-8)}
                        </p>
                      </div>
                      <div className="min-w-0 text-sm">
                        <p className="font-medium tabular-nums">
                          {formatTaka(loan.requestedPrincipalPoisha)}
                        </p>
                        <time
                          className="text-muted-foreground"
                          dateTime={loan.createdAt}
                        >
                          {formatDhakaTimestamp(loan.createdAt)}
                        </time>
                      </div>
                      <p className="text-sm font-medium">
                        {loan.status === "UNDER_REVIEW" && loan.forwardedAt
                          ? "Forwarded to Admin"
                          : loanStatuses[loan.status]}
                      </p>
                      <Link
                        className={`${historyLink} ${secondaryStyle} w-fit lg:justify-self-end`}
                        href={`/${workspace}/loans/review/${loan.id}`}
                      >
                        View application
                        <span className="sr-only">
                          {" "}
                          ending {loan.id.slice(-8)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  No applications in this queue.
                </p>
              )}
              {(page > 1 || result.hasNextPage) && (
                <div className="border-t p-4">
                  <Pager
                    page={page}
                    next={result.hasNextPage}
                    onPage={(next) => select(queue, next)}
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
