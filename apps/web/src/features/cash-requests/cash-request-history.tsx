"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import Link from "next/link";
import { useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pager } from "@/features/management/management-ui";
import { ErrorMessage, secondaryStyle } from "@/features/onboarding/form-ui";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import {
  CashRequestAmount,
  CashRequestBadge,
  CashRequestHeader,
} from "./cash-request-ui";
import {
  cashRequestStatuses,
  cashRequestTypes,
  useCustomerCashRequestsQuery,
  useCancelCashRequestMutation,
  type CashRequest,
} from "./cash-requests-api";

function RequestSummary({ request }: { request: CashRequest }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-semibold">{cashRequestTypes[request.type]}</p>
      <p className="text-xs text-muted-foreground">
        Account {request.accountNumber}
      </p>
      <p className="break-words text-sm">{request.description}</p>
      {request.rejectionReason && (
        <p className="break-words text-sm text-muted-foreground">
          Reason for rejection: {request.rejectionReason}
        </p>
      )}
      {request.transactionReference && (
        <Link
          href={`/customer/transactions/${request.transactionReference}`}
          className="inline-flex min-h-11 items-center rounded text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          View transaction
        </Link>
      )}
    </div>
  );
}

function SubmittedAt({ request }: { request: CashRequest }) {
  return (
    <time
      dateTime={request.createdAt}
      className="text-sm text-muted-foreground"
    >
      {formatDhakaTimestamp(request.createdAt)}
    </time>
  );
}

export function CashRequestHistory() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const query = useCustomerCashRequestsQuery(
    { page, status: status || undefined },
    {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
    },
  );
  const [target, setTarget] = useState<CashRequest | null>(null);
  const [feedback, setFeedback] = useState("");
  const [cancel, cancellation] = useCancelCashRequestMutation();
  async function confirmCancellation() {
    if (!target || cancellation.isLoading) return;
    setFeedback("");
    try {
      await cancel(target.id).unwrap();
      setFeedback("Cash request cancelled.");
    } catch {
      setFeedback(
        "Cancellation could not be confirmed. Check the latest request status before retrying.",
      );
    }
    setTarget(null);
  }
  const rows = query.currentData?.requests ?? [];

  return (
    <section className="space-y-5">
      <CashRequestHeader section="history" />
      {feedback && (
        <p role="status" className="text-sm">
          {feedback}
        </p>
      )}
      <AlertDialog.Root
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !cancellation.isLoading) setTarget(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim/60" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-5 shadow-lg">
            <AlertDialog.Title className="text-lg font-semibold">
              Cancel cash request?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              The request will close and any held funds will become available
              again.
            </AlertDialog.Description>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button
                  className={secondaryStyle}
                  disabled={cancellation.isLoading}
                >
                  Keep request
                </Button>
              </AlertDialog.Cancel>
              <Button
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={cancellation.isLoading}
                onClick={() => void confirmCancellation()}
              >
                {cancellation.isLoading
                  ? "Cancelling?"
                  : "Confirm cancellation"}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Request history</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Submission times use Asia/Dhaka.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Combobox
              label="Status"
              className="flex min-w-36 flex-col gap-1 text-sm font-medium"
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
          <ListSkeleton label="Loading requests" tableAt="lg" />
        )}
        {query.isError ? (
          <div className="space-y-3 p-4">
            <ErrorMessage message="Could not load request history." />
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
              {!rows.length ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {status
                    ? "No requests match this status."
                    : "No cash requests yet."}
                </p>
              ) : (
                <>
                  <ul className="divide-y lg:hidden">
                    {rows.map((request) => (
                      <li key={request.id} className="space-y-3 p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="break-all font-semibold tabular-nums">
                            <CashRequestAmount request={request} />
                          </span>
                          <CashRequestBadge status={request.status} />
                        </div>
                        <RequestSummary request={request} />
                        {request.status === "PENDING" && (
                          <Button
                            className={`${secondaryStyle} mt-2 min-h-11`}
                            onClick={() => setTarget(request)}
                          >
                            Cancel request
                          </Button>
                        )}
                        <p className="text-sm text-muted-foreground">
                          Submitted <SubmittedAt request={request} />
                        </p>
                      </li>
                    ))}
                  </ul>
                  <table className="hidden w-full table-fixed text-left text-sm lg:table">
                    <caption className="sr-only">
                      Your simulated deposits and withdrawals
                    </caption>
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-3">
                          Request
                        </th>
                        <th
                          scope="col"
                          className="w-[19%] px-4 py-3 text-right"
                        >
                          Amount
                        </th>
                        <th scope="col" className="w-[24%] px-4 py-3">
                          Submitted
                        </th>
                        <th scope="col" className="w-[17%] px-4 py-3">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((request) => (
                        <tr key={request.id} className="align-top">
                          <td className="p-4">
                            <RequestSummary request={request} />
                            {request.status === "PENDING" && (
                              <Button
                                className={secondaryStyle + " mt-2 min-h-11"}
                                onClick={() => setTarget(request)}
                              >
                                Cancel request
                              </Button>
                            )}
                          </td>
                          <td className="break-all p-4 text-right font-semibold tabular-nums">
                            <CashRequestAmount request={request} />
                          </td>
                          <td className="p-4">
                            <SubmittedAt request={request} />
                          </td>
                          <td className="p-4">
                            <CashRequestBadge status={request.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
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
