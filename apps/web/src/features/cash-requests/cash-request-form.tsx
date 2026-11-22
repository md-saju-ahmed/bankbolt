"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  accountStatuses,
  accountTypes,
  formatTaka,
  parseTakaInput,
} from "@/features/accounts/account-display";
import { errorCode } from "@/features/auth/auth-api";
import { useOwnedAccountsQuery } from "@/features/management/management-api";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  Field,
  fieldStyle,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaFullTimestamp } from "@/lib/dhaka-date";
import {
  CashRequestBadge,
  CashRequestHeader,
  cashRequestsPath,
  cashLinkStyle,
} from "./cash-request-ui";
import {
  cashRequestTypes,
  useSubmitCashRequestMutation,
  type CashRequest,
  type CashRequestInput,
  type CashRequestType,
} from "./cash-requests-api";

const withdrawalNotice =
  "The requested amount is held until the withdrawal is approved, rejected, or cancelled.";

function positivePoisha(value: string) {
  const amount = parseTakaInput(value);
  if (amount === "0") throw new Error("Enter an amount greater than zero.");
  return amount;
}

export function CashRequestForm({ type }: { type: CashRequestType }) {
  const label = cashRequestTypes[type];
  const withdrawal = type === "WITHDRAWAL";
  const [page, setPage] = useState(1);
  const [accountId, setAccountId] = useState("");
  const [review, setReview] = useState<CashRequestInput | null>(null);
  const [result, setResult] = useState<CashRequest | null>(null);
  const [amountError, setAmountError] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const amountField = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const sending = useRef(false);
  const accounts = useOwnedAccountsQuery(page, {
    refetchOnMountOrArgChange: true,
  });
  const [submit, { isLoading }] = useSubmitCashRequestMutation();
  const rows = accounts.currentData?.accounts ?? [];
  const selected = rows.find((account) => account.id === accountId);

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uncertain || sending.current) return;
    setError("");
    if (!selected || selected.restriction) {
      setError("Choose an active account.");
      return;
    }
    const fields = new FormData(event.currentTarget);
    let amountPoisha: string;
    try {
      amountPoisha = positivePoisha(String(fields.get("amount") ?? ""));
      setAmountError("");
    } catch (failure) {
      setAmountError(
        failure instanceof Error
          ? failure.message
          : "Enter a valid BDT amount.",
      );
      amountField.current?.focus();
      return;
    }
    const description = String(fields.get("description") ?? "").trim();
    if (!description) {
      setError("Enter a description for the request.");
      return;
    }
    setReview({ accountId, amountPoisha, description, type });
  }

  async function confirm() {
    if (!review || sending.current) return;
    sending.current = true;
    try {
      const response = await submit(review).unwrap();
      setResult(response.request);
    } catch (failure) {
      const status =
        typeof failure === "object" && failure && "status" in failure
          ? failure.status
          : null;
      if (typeof status !== "number" || status >= 500) {
        setUncertain(true);
      } else {
        setError(
          errorCode(failure) === "ACCOUNT_RESTRICTED"
            ? "This account is restricted. Choose another active account."
            : onboardingError(
                failure,
                "The request could not be submitted. Try again.",
              ),
        );
      }
    } finally {
      sending.current = false;
      setReview(null);
    }
  }

  return (
    <section className="space-y-5">
      <CashRequestHeader section={withdrawal ? "withdrawal" : "deposit"} />
      {result ? (
        <Card className="max-w-2xl space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              ref={resultHeading}
              tabIndex={-1}
              className="text-lg font-semibold outline-none"
            >
              {label} request submitted
            </h2>
            <CashRequestBadge status={result.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {formatTaka(result.amountPoisha)}
            </span>{" "}
            · Account {result.accountNumber}
          </p>
          <p className="text-sm text-muted-foreground">
            Submitted{" "}
            <time dateTime={result.createdAt}>
              {formatDhakaFullTimestamp(result.createdAt)}
            </time>
          </p>
          {withdrawal && (
            <p className="text-sm text-muted-foreground">{withdrawalNotice}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              href={cashRequestsPath}
              className={`${cashLinkStyle} ${primaryStyle}`}
            >
              View request history
            </Link>
            <Button
              className={secondaryStyle}
              onClick={() => {
                setAccountId("");
                setResult(null);
              }}
            >
              New request
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="max-w-2xl space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{label} details</h2>
          {withdrawal && (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {withdrawalNotice}
            </p>
          )}
          {uncertain && (
            <div className="space-y-2 rounded-md border border-warning-border bg-warning-surface p-3 text-sm text-warning-ink">
              <p role="alert">
                The submission outcome is unknown. Check request history before
                submitting another request.
              </p>
              <Link
                href={cashRequestsPath}
                className={`${cashLinkStyle} ${secondaryStyle}`}
              >
                Check request history
              </Link>
            </div>
          )}
          {accounts.isFetching && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading accounts…
            </p>
          )}
          {accounts.isError && (
            <div className="space-y-2">
              <ErrorMessage message="Could not load your accounts." />
              <Button
                className={secondaryStyle}
                onClick={() => void accounts.refetch()}
              >
                Try again
              </Button>
            </div>
          )}
          {accounts.currentData && !rows.some((row) => !row.restriction) && (
            <p className="text-sm text-muted-foreground">
              There are no active accounts on this page.
            </p>
          )}
          <form method="post" onSubmit={prepare} className="space-y-4">
            <fieldset
              disabled={uncertain || isLoading}
              className="min-w-0 space-y-4"
            >
              <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
                Account
                <select
                  required
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className={fieldStyle}
                >
                  <option value="">Select an active account</option>
                  {rows.map((account) => (
                    <option
                      key={account.id}
                      value={account.id}
                      disabled={Boolean(account.restriction)}
                    >
                      {accountTypes[account.type]} · {account.accountNumber}
                      {account.restriction
                        ? ` · ${accountStatuses[account.status]}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {accounts.currentData && (
                <Pager
                  page={page}
                  next={accounts.currentData.hasNextPage}
                  onPage={(next) => {
                    setAccountId("");
                    setPage(next);
                  }}
                />
              )}
              {selected && withdrawal && (
                <p className="text-sm text-muted-foreground">
                  Available balance{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatTaka(selected.availableBalancePoisha)}
                  </span>
                </p>
              )}
              <div className="space-y-1">
                <Field
                  ref={amountField}
                  name="amount"
                  label="Amount (BDT)"
                  inputMode="decimal"
                  maxLength={20}
                  required
                  aria-invalid={Boolean(amountError)}
                  aria-describedby={
                    amountError ? "cash-amount-error" : undefined
                  }
                  onChange={() => {
                    if (amountError) setAmountError("");
                  }}
                  onBlur={(event) => {
                    if (!event.target.value.trim()) return;
                    try {
                      positivePoisha(event.target.value);
                      setAmountError("");
                    } catch (failure) {
                      setAmountError(
                        failure instanceof Error
                          ? failure.message
                          : "Enter a valid BDT amount.",
                      );
                    }
                  }}
                />
                {amountError && (
                  <p
                    id="cash-amount-error"
                    role="alert"
                    className="text-sm text-danger-ink"
                  >
                    {amountError}
                  </p>
                )}
              </div>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Description
                <textarea
                  name="description"
                  className={`${fieldStyle} py-2`}
                  required
                  maxLength={300}
                  rows={3}
                />
              </label>
            </fieldset>
            <ErrorMessage message={error} />
            <Button
              ref={reviewButton}
              className={primaryStyle}
              type="submit"
              disabled={
                !selected ||
                Boolean(selected.restriction) ||
                uncertain ||
                isLoading
              }
            >
              Review request
            </Button>
          </form>
        </Card>
      )}
      <AlertDialog.Root
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !sending.current) setReview(null);
        }}
      >
        {review && (
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim/60" />
            <AlertDialog.Content
              onEscapeKeyDown={(event) => {
                if (sending.current) event.preventDefault();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                (resultHeading.current ?? reviewButton.current)?.focus();
              }}
              className="fixed top-1/2 left-1/2 z-50 max-h-[90svh] w-[calc(100%-2rem)] max-w-md -translate-1/2 overflow-auto rounded-xl border bg-card p-5 shadow-lg sm:p-6"
            >
              <AlertDialog.Title className="text-lg font-semibold">
                Review {label.toLowerCase()} request
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-1 text-sm text-muted-foreground">
                This simulated request goes to BankBolt staff for review.
              </AlertDialog.Description>
              <dl className="mt-4 space-y-3 border-y py-4 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Account</dt>
                  <dd className="font-semibold">{selected?.accountNumber}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="break-all font-semibold tabular-nums">
                    {formatTaka(review.amountPoisha)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Description</dt>
                  <dd className="mt-1 break-words">{review.description}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <AlertDialog.Cancel asChild>
                  <Button className={secondaryStyle} disabled={isLoading}>
                    Back to edit
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  className={primaryStyle}
                  disabled={isLoading}
                  onClick={() => void confirm()}
                >
                  {isLoading ? "Submitting…" : "Submit request"}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        )}
      </AlertDialog.Root>
    </section>
  );
}
