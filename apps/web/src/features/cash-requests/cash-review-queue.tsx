"use client";

import Link from "next/link";
import { useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pager } from "@/features/management/management-ui";
import { ErrorMessage, secondaryStyle } from "@/features/onboarding/form-ui";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import { CashRequestAmount, CashRequestBadge } from "./cash-request-ui";
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
            <Combobox
              label="Status"
              className="flex min-w-32 flex-col gap-1 text-sm font-medium"
              value={status}
              onValueChange={(selectedValue) => {
                setStatus(selectedValue);
                setPage(1);
              }}
              options={[
                { value: "", label: "All statuses" },
                ...Object.entries(cashRequestStatuses).map(([code, label]) => ({
                  value: code,
                  label: label,
                })),
              ]}
            />
            <Combobox
              label="Type"
              className="flex min-w-32 flex-col gap-1 text-sm font-medium"
              value={type}
              onValueChange={(selectedValue) => {
                setType(selectedValue);
                setPage(1);
              }}
              options={[
                { value: "", label: "All types" },
                ...Object.entries(cashRequestTypes).map(([code, label]) => ({
                  value: code,
                  label: label,
                })),
              ]}
            />
            <Button
              className={secondaryStyle}
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Refresh
            </Button>
          </div>
        </div>
        {query.isFetching && !query.isError && !query.currentData && (
          <ListSkeleton label="Loading requests" tableAt="xl" />
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
                            <CashRequestAmount request={record} />
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
                            <CashRequestAmount request={record} />
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
