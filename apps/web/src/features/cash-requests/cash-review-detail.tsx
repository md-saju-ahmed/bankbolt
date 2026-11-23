"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { formatTaka } from "@/features/accounts/account-display";
import { errorCode } from "@/features/auth/auth-api";
import { DetailFields } from "@/features/management/management-ui";
import {
  ErrorMessage,
  fieldStyle,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaFullTimestamp } from "@/lib/dhaka-date";
import { CashRequestBadge, cashLinkStyle } from "./cash-request-ui";
import {
  cashRequestTypes,
  useCashRequestReviewQuery,
  useDecideCashRequestMutation,
} from "./cash-requests-api";

const decisionErrors: Record<string, string> = {
  ACCOUNT_RESTRICTED:
    "The account is restricted and cannot receive or send funds.",
  INSUFFICIENT_FUNDS: "The current balance cannot cover this withdrawal.",
  ACCOUNT_BALANCE_LIMIT: "The account cannot accept this deposit.",
  SELF_REVIEW: "You cannot review your own cash request.",
};
const rejectStyle = "bg-destructive text-white hover:bg-destructive/90";

export function CashReviewDetail({
  id,
  workspace,
}: {
  id: string;
  workspace: string;
}) {
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const lock = useRef(false);
  const approveButton = useRef<HTMLButtonElement>(null);
  const rejectButton = useRef<HTMLButtonElement>(null);
  const lastAction = useRef<"approve" | "reject">("approve");
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useCashRequestReviewQuery(id, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const [decide, { isLoading }] = useDecideCashRequestMutation();
  const record = query.currentData?.request;
  const typeLabel = record ? cashRequestTypes[record.type] : "";

  function openDecision(value: "approve" | "reject") {
    lastAction.current = value;
    setFeedback("");
    setError("");
    setAction(value);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || lock.current) return;
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    ).trim();
    if (action === "reject" && !reason) {
      setError("Enter a reason for rejection.");
      return;
    }
    lock.current = true;
    setError("");
    try {
      const { request } = await decide(
        action === "approve" ? { id, action } : { id, action, reason },
      ).unwrap();
      setSaved(true);
      setFeedback(
        request.status === "APPROVED"
          ? "Request approved. The transaction was posted."
          : "Request rejected.",
      );
      setAction(null);
    } catch (failure) {
      const code = errorCode(failure);
      const status =
        typeof failure === "object" && failure !== null && "status" in failure
          ? failure.status
          : null;
      if (
        code === "CASH_REQUEST_DECIDED" ||
        typeof status !== "number" ||
        status >= 500
      ) {
        setAction(null);
        setUnknown(true);
        setFeedback(
          code === "CASH_REQUEST_DECIDED"
            ? "This request was already decided."
            : "The decision outcome is unknown. Check the latest status before retrying.",
        );
        if (code === "CASH_REQUEST_DECIDED") void query.refetch();
      } else {
        setError(
          decisionErrors[code ?? ""] ??
            onboardingError(failure, "Could not save the decision. Try again."),
        );
      }
    } finally {
      lock.current = false;
    }
  }

  async function refresh() {
    const result = await query.refetch();
    if (result.data) {
      setUnknown(false);
      setFeedback("");
    }
  }

  return (
    <section className="max-w-3xl space-y-5">
      <Link
        href={`/${workspace}/cash-requests`}
        className={`${cashLinkStyle} ${secondaryStyle} gap-2`}
      >
        <ArrowLeft aria-hidden size={16} />
        Back to review queue
      </Link>
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-3xl font-semibold tracking-tight outline-none"
      >
        Cash request details
      </h1>
      {feedback && (
        <p
          role="status"
          className="rounded-md border bg-card px-4 py-3 text-sm"
        >
          {feedback}
        </p>
      )}
      {query.isFetching && !query.isError && !record && (
        <DetailSkeleton label="Loading request" />
      )}
      {query.isError ? (
        <Card className="space-y-3 p-5">
          <ErrorMessage
            message={
              errorCode(query.error) === "NOT_FOUND"
                ? "This cash request is unavailable."
                : "Could not load the cash request."
            }
          />
          <Button className={secondaryStyle} onClick={() => void refresh()}>
            Try again
          </Button>
        </Card>
      ) : (
        record && (
          <Card className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
              <h2 className="text-lg font-semibold">{typeLabel} request</h2>
              <CashRequestBadge status={record.status} />
            </div>
            <DetailFields
              fields={[
                ["Customer", record.customerName],
                ["Account", record.accountNumber],
                ["Amount", formatTaka(record.amountPoisha)],
                ["Submitted", formatDhakaFullTimestamp(record.createdAt)],
                ...(record.reviewedAt
                  ? ([
                      ["Reviewed by", record.reviewerName],
                      [
                        "Reviewed at",
                        formatDhakaFullTimestamp(record.reviewedAt),
                      ],
                    ] as [string, string | null][])
                  : []),
              ]}
            />
            <div>
              <h3 className="text-sm text-muted-foreground">Description</h3>
              <p className="mt-1 break-words text-sm">{record.description}</p>
            </div>
            {record.rejectionReason && (
              <div>
                <h3 className="text-sm text-muted-foreground">
                  Reason for rejection
                </h3>
                <p className="mt-1 break-words text-sm">
                  {record.rejectionReason}
                </p>
              </div>
            )}
            {record.transactionReference && (
              <Link
                href={`/${workspace}/transactions/${record.transactionReference}`}
                className={`${cashLinkStyle} ${secondaryStyle}`}
              >
                View transaction
              </Link>
            )}
            {record.status === "PENDING" && !saved && (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {unknown ? (
                  <Button
                    className={secondaryStyle}
                    disabled={query.isFetching}
                    onClick={() => void refresh()}
                  >
                    Check latest status
                  </Button>
                ) : (
                  <>
                    <Button
                      className={primaryStyle}
                      ref={approveButton}
                      onClick={() => openDecision("approve")}
                    >
                      Approve request
                    </Button>
                    <Button
                      className={secondaryStyle}
                      ref={rejectButton}
                      onClick={() => openDecision("reject")}
                    >
                      Reject request
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
        )
      )}
      <AlertDialog.Root
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open && !lock.current) setAction(null);
        }}
      >
        {action && record && (
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim/60" />
            <AlertDialog.Content
              onEscapeKeyDown={(event) => {
                if (lock.current) event.preventDefault();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                requestAnimationFrame(() => {
                  const button =
                    lastAction.current === "approve"
                      ? approveButton.current
                      : rejectButton.current;
                  if (button && !button.disabled) button.focus();
                  else heading.current?.focus();
                });
              }}
              className="fixed top-1/2 left-1/2 z-50 max-h-[90svh] w-[calc(100%-2rem)] max-w-md -translate-1/2 overflow-auto rounded-xl border bg-card p-5 shadow-lg sm:p-6"
            >
              <AlertDialog.Title className="text-lg font-semibold">
                {action === "approve" ? "Approve" : "Reject"}{" "}
                {typeLabel.toLowerCase()} request
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                {action === "approve"
                  ? `Approval posts ${formatTaka(record.amountPoisha)} ${record.type === "DEPOSIT" ? "to" : "from"} account ${record.accountNumber}.`
                  : `Reject this ${formatTaka(record.amountPoisha)} request for account ${record.accountNumber}. The balance stays unchanged.`}
              </AlertDialog.Description>
              <form method="post" onSubmit={confirm} className="mt-4 space-y-4">
                {action === "reject" && (
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Reason for rejection
                    <textarea
                      name="reason"
                      rows={3}
                      required
                      maxLength={300}
                      disabled={isLoading}
                      onChange={() => setError("")}
                      className={`${fieldStyle} py-2`}
                    />
                  </label>
                )}
                <ErrorMessage message={error} />
                <div className="flex flex-wrap justify-end gap-2">
                  <AlertDialog.Cancel asChild>
                    <Button className={secondaryStyle} disabled={isLoading}>
                      Back
                    </Button>
                  </AlertDialog.Cancel>
                  <Button
                    type="submit"
                    className={
                      action === "approve" ? primaryStyle : rejectStyle
                    }
                    disabled={isLoading}
                  >
                    {isLoading
                      ? "Saving…"
                      : action === "approve"
                        ? "Confirm approval"
                        : "Confirm rejection"}
                  </Button>
                </div>
              </form>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        )}
      </AlertDialog.Root>
    </section>
  );
}
