"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTaka } from "@/features/accounts/account-display";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  fieldStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import { CashRequestBadge } from "./cash-request-ui";
import {
  cashRequestStatuses,
  cashRequestTypes,
  useCashReviewQueueQuery,
  type ReviewCashRequest,
} from "./cash-requests-api";

function RequestLink({
  root,
  record,
}: {
  root: string;
  record: ReviewCashRequest;
}) {
  return (
    <Link
      href={`${root}/review/${record.id}`}
      className="inline-flex min-h-11 w-fit items-center rounded text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {record.status === "PENDING" ? "Review request" : "View decision"}
      <span className="sr-only">
        {" "}
        for {record.customerName}, account {record.accountNumber}
      </span>
    </Link>
  );
}

function Customer({ record }: { record: ReviewCashRequest }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-semibold">{record.customerName}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Account {record.accountNumber}
      </p>
    </div>
  );
}

function Submitted({ record }: { record: ReviewCashRequest }) {
  return (
    <time dateTime={record.createdAt} className="text-sm text-muted-foreground">
      {formatDhakaTimestamp(record.createdAt)}
    </time>
  );
}

export function CashReviewQueue({ root }: { root: string }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("PENDING");
  const [type, setType] = useState("");
  const query = useCashReviewQueueQuery(
    { page, status: status || undefined, type: type || undefined },
    {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
    },
  );
  const rows = query.currentData?.requests ?? [];

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Cash request review
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review simulated deposit and withdrawal requests.
        </p>
      </header>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Review queue</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Submission times use Asia/Dhaka.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-32 flex-col gap-1 text-sm font-medium">
              Status
              <select
                className={fieldStyle}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {Object.entries(cashRequestStatuses).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-32 flex-col gap-1 text-sm font-medium">
              Type
              <select
                className={fieldStyle}
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All types</option>
                {Object.entries(cashRequestTypes).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              className={secondaryStyle}
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Refresh
            </Button>
          </div>
        </div>
        {query.isFetching && (
          <p role="status" className="mx-4 mt-4 text-sm text-muted-foreground">
            Loading requests…
          </p>
        )}
        {query.isError ? (
          <div className="space-y-3 p-4">
            <ErrorMessage message="Could not load the review queue." />
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
              {rows.length ? (
                <>
                  <ul className="divide-y xl:hidden">
                    {rows.map((record) => (
                      <li key={record.id} className="space-y-2 p-4 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <Customer record={record} />
                          <CashRequestBadge status={record.status} />
                        </div>
                        <p className="tabular-nums">
                          {cashRequestTypes[record.type]}{" "}
                          <strong className="break-all">
                            {formatTaka(record.amountPoisha)}
                          </strong>
                        </p>
                        <Submitted record={record} />
                        <div>
                          <RequestLink root={root} record={record} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <table className="hidden w-full table-fixed text-left text-sm xl:table">
                    <caption className="sr-only">
                      Cash requests awaiting or completed review
                    </caption>
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-3">
                          Customer and account
                        </th>
                        <th scope="col" className="w-[13%] px-4 py-3">
                          Type
                        </th>
                        <th
                          scope="col"
                          className="w-[14%] px-4 py-3 text-right"
                        >
                          Amount
                        </th>
                        <th scope="col" className="w-[18%] px-4 py-3">
                          Submitted
                        </th>
                        <th scope="col" className="w-[13%] px-4 py-3">
                          Status
                        </th>
                        <th scope="col" className="w-[17%] px-4 py-3">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((record) => (
                        <tr key={record.id}>
                          <td className="p-4">
                            <Customer record={record} />
                          </td>
                          <td className="p-4">
                            {cashRequestTypes[record.type]}
                          </td>
                          <td className="break-all p-4 text-right font-semibold tabular-nums">
                            {formatTaka(record.amountPoisha)}
                          </td>
                          <td className="p-4">
                            <Submitted record={record} />
                          </td>
                          <td className="p-4">
                            <CashRequestBadge status={record.status} />
                          </td>
                          <td className="px-4 py-2">
                            <RequestLink root={root} record={record} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  No cash requests match these filters.
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
