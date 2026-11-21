"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { historyLink } from "@/features/transactions/transaction-display";
import { formatDhakaFullTimestamp } from "@/lib/dhaka-date";
import {
  loanLabels,
  loanStatuses,
  useLoanReviewQuery,
  useReviewLoanMutation,
} from "./loans-api";

const feedbackByAction = {
  review: "Application is under review.",
  notes: "Internal note saved.",
  forward: "Application forwarded to Admin.",
};
const reviewErrors: Record<string, string> = {
  LOAN_NOT_PENDING: "The application is no longer pending.",
  LOAN_NOT_UNDER_REVIEW: "The application is no longer under review.",
  LOAN_ALREADY_FORWARDED:
    "The application has already been forwarded to Admin.",
};

function readableStatus(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
}

export function LoanReviewDetail({ id }: { id: string }) {
  const query = useLoanReviewQuery(id, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const [mutate, { isLoading }] = useReviewLoanMutation();
  const [note, setNote] = useState("");
  const [confirmForward, setConfirmForward] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const forwarded = useRef(false);
  const review = query.currentData;
  const busy = isLoading || query.isFetching;

  async function save(action: keyof typeof feedbackByAction) {
    if (busy) return;
    setFeedback("");
    setError("");
    try {
      await mutate(
        action === "notes" ? { id, action, note: note.trim() } : { id, action },
      ).unwrap();
      if (action === "notes") setNote("");
      if (action === "review") heading.current?.focus();
      if (action === "forward") {
        forwarded.current = true;
        setConfirmForward(false);
      }
      setFeedback(feedbackByAction[action]);
    } catch (failure) {
      const fallback =
        action === "notes"
          ? "Could not confirm the note was saved. Check the notes before retrying."
          : "Could not update the application. Try again.";
      setConfirmForward(false);
      setError(
        reviewErrors[errorCode(failure) ?? ""] ??
          onboardingError(failure, fallback),
      );
    }
  }

  return (
    <section className="max-w-4xl space-y-5">
      <Link className={`${historyLink} ${secondaryStyle}`} href="/staff/loans">
        Back to loan queue
      </Link>
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-3xl font-semibold tracking-tight"
      >
        Loan application
      </h1>
      {feedback && (
        <p className="rounded-md border bg-card p-3 text-sm" role="status">
          {feedback}
        </p>
      )}
      <ErrorMessage message={error} />
      {query.isError ? (
        <div className="space-y-3">
          <ErrorMessage
            message={onboardingError(
              query.error,
              "Could not load the application.",
            )}
          />
          <Button
            className={secondaryStyle}
            disabled={busy}
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : review ? (
        <>
          <Card className="gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {loanLabels[review.loan.type]} loan
              </h2>
              <p className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                {loanStatuses[review.loan.status]}
              </p>
            </div>
            <DetailFields
              fields={[
                ["Application ID", review.loan.id],
                ["Submitted", formatDhakaFullTimestamp(review.loan.createdAt)],
                [
                  "Requested amount",
                  formatTaka(review.loan.requestedPrincipalPoisha),
                ],
                ["Term", `${review.loan.termMonths} months`],
                [
                  "Declared monthly income",
                  formatTaka(review.loan.monthlyIncomePoisha),
                ],
                ["Employment", review.loan.employmentStatus],
              ]}
            />
            <div>
              <h3 className="text-sm text-muted-foreground">
                Application description
              </h3>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">
                {review.loan.description}
              </p>
            </div>
          </Card>
          <Card className="gap-4 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Customer and account</h2>
            <DetailFields
              fields={[
                ["Customer", review.customer.fullName],
                [
                  "Verification",
                  readableStatus(review.customer.verificationStatus),
                ],
                [
                  "Customer access",
                  review.customer.blocked
                    ? "Blocked"
                    : review.customer.accessActive
                      ? "Active"
                      : "Inactive",
                ],
                [
                  "Disbursement account",
                  `${review.customer.accountNumber} · ${readableStatus(review.customer.accountType)}`,
                ],
                [
                  "Account status",
                  readableStatus(review.customer.accountStatus),
                ],
              ]}
            />
          </Card>
          <Card className="gap-4 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Internal notes</h2>
            {review.notes.length ? (
              <ul className="divide-y border-y">
                {review.notes.map((entry) => (
                  <li key={entry.id} className="space-y-1 py-3">
                    <p className="text-sm font-semibold break-words">
                      {entry.authorName}
                    </p>
                    <time
                      className="block text-sm text-muted-foreground"
                      dateTime={entry.createdAt}
                    >
                      {formatDhakaFullTimestamp(entry.createdAt)}
                    </time>
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {entry.note}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No internal notes yet.
              </p>
            )}
            {review.loan.status === "UNDER_REVIEW" &&
              !review.loan.forwardedAt && (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (note.trim()) void save("notes");
                  }}
                >
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Add internal note
                    <textarea
                      className={`${fieldStyle} py-2`}
                      aria-describedby="loan-note-visibility"
                      required
                      maxLength={2000}
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  <p
                    id="loan-note-visibility"
                    className="text-sm text-muted-foreground"
                  >
                    Visible to Staff and Admin only.
                  </p>
                  <Button
                    type="submit"
                    className={secondaryStyle}
                    disabled={busy || !note.trim()}
                  >
                    Save note
                  </Button>
                </form>
              )}
          </Card>
          {review.loan.forwardedAt ? (
            <p className="text-sm font-medium">
              Forwarded to Admin on{" "}
              {formatDhakaFullTimestamp(review.loan.forwardedAt)}
            </p>
          ) : review.loan.status === "PENDING" ? (
            <Button
              className={primaryStyle}
              disabled={busy}
              onClick={() => void save("review")}
            >
              Start review
            </Button>
          ) : (
            review.loan.status === "UNDER_REVIEW" && (
              <AlertDialog.Root
                open={confirmForward}
                onOpenChange={(open) => {
                  if (!isLoading) setConfirmForward(open);
                }}
              >
                <AlertDialog.Trigger asChild>
                  <Button className={primaryStyle} disabled={busy}>
                    Forward to Admin
                  </Button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="fixed inset-0 z-40 bg-foreground/55" />
                  <AlertDialog.Content
                    className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-1/2 space-y-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-lg"
                    onCloseAutoFocus={(event) => {
                      if (forwarded.current) {
                        event.preventDefault();
                        heading.current?.focus();
                      }
                    }}
                  >
                    <AlertDialog.Title className="text-lg font-semibold">
                      Forward application to Admin?
                    </AlertDialog.Title>
                    <AlertDialog.Description className="text-sm text-muted-foreground">
                      Admin will receive the application and its saved internal
                      notes. Forwarding closes note entry for this review.
                      {note.trim() && " The unsaved note will be discarded."}
                    </AlertDialog.Description>
                    <div className="flex flex-wrap justify-end gap-2">
                      <AlertDialog.Cancel asChild>
                        <Button className={secondaryStyle} disabled={isLoading}>
                          Cancel
                        </Button>
                      </AlertDialog.Cancel>
                      <Button
                        className={primaryStyle}
                        disabled={busy}
                        onClick={() => void save("forward")}
                      >
                        {isLoading ? "Forwarding…" : "Confirm forwarding"}
                      </Button>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            )
          )}
          {isLoading && !confirmForward && (
            <p className="text-sm text-muted-foreground" role="status">
              Saving…
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground" role="status">
          Loading application…
        </p>
      )}
    </section>
  );
}
