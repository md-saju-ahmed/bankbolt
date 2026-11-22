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
import { DetailFields, Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  Field,
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
  useLazyLoanEstimateQuery,
  useLoanCatalogQuery,
  useSubmitLoanApplicationMutation,
  type LoanApplication,
  type LoanApplicationInput,
} from "./loans-api";

const historyPath = "/customer/loans";
type Review = {
  application: LoanApplicationInput;
  accountNumber: string;
  emiPoisha: string;
  annualRateBps: number;
};

function amountRange(product: {
  minPrincipalPoisha: string;
  maxPrincipalPoisha: string;
}) {
  return `${formatTaka(product.minPrincipalPoisha)}–${formatTaka(product.maxPrincipalPoisha)}`;
}

function failureMessage(failure: unknown, fallback: string) {
  const code = errorCode(failure);
  if (code === "LOAN_APPLICANT_UNVERIFIED")
    return "Ask Bank Staff to verify your customer profile before applying.";
  if (code === "LOAN_APPLICANT_UNDERAGE")
    return "You must be at least 18 years old to apply.";
  if (code === "LOAN_AFFORDABILITY_LIMIT")
    return "Total monthly loan payments would exceed 40% of declared monthly income. Try a smaller amount or a longer term within the loan limits.";
  if (code === "LOAN_TERMS_OUT_OF_RANGE")
    return "Choose an amount and term within this loan type’s limits.";
  if (code === "ACCOUNT_RESTRICTED" || code === "NOT_FOUND")
    return "Choose an active account you own.";
  return onboardingError(failure, fallback);
}

export function LoanApplicationForm() {
  const [type, setType] = useState("");
  const [accountId, setAccountId] = useState("");
  const [page, setPage] = useState(1);
  const [review, setReview] = useState<Review | null>(null);
  const [result, setResult] = useState<LoanApplication | null>(null);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  const busy = useRef(false);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const catalog = useLoanCatalogQuery();
  const accounts = useOwnedAccountsQuery(page, {
    refetchOnMountOrArgChange: true,
  });
  const [estimate, { isFetching: estimating }] = useLazyLoanEstimateQuery();
  const [submit, { isLoading: submitting }] =
    useSubmitLoanApplicationMutation();
  const product = catalog.currentData?.products.find(
    (item) => item.type === type,
  );
  const rows = accounts.currentData?.accounts ?? [];
  const account = rows.find((item) => item.id === accountId);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || unknown) return;
    setError("");
    if (!account || account.restriction || !product) {
      setError("Select a loan type and an active disbursement account.");
      return;
    }
    const fields = new FormData(event.currentTarget);
    busy.current = true;
    try {
      const requestedPrincipalPoisha = parseTakaInput(
        String(fields.get("amount") ?? ""),
      );
      if (
        BigInt(requestedPrincipalPoisha) < BigInt(product.minPrincipalPoisha) ||
        BigInt(requestedPrincipalPoisha) > BigInt(product.maxPrincipalPoisha)
      ) {
        throw new Error(
          `Enter a requested amount within ${amountRange(product)}.`,
        );
      }
      const terms = {
        type: product.type,
        requestedPrincipalPoisha,
        termMonths: Number(fields.get("term")),
      };
      const employmentStatus = String(fields.get("employment") ?? "").trim();
      const description = String(fields.get("description") ?? "").trim();
      if (!employmentStatus || !description)
        throw new Error("Enter your employment status and a description.");
      const application = {
        ...terms,
        disbursementAccountId: account.id,
        monthlyIncomePoisha: parseTakaInput(String(fields.get("income") ?? "")),
        employmentStatus,
        description,
      };
      const quote = await estimate(terms).unwrap();
      setReview({
        ...quote,
        application,
        accountNumber: account.accountNumber,
      });
    } catch (failure) {
      setError(
        failureMessage(
          failure,
          failure instanceof Error
            ? failure.message
            : "Could not load an EMI estimate.",
        ),
      );
    } finally {
      busy.current = false;
    }
  }

  async function confirm() {
    if (!review || busy.current) return;
    busy.current = true;
    try {
      const { loan } = await submit(review.application).unwrap();
      setResult(loan);
    } catch (failure) {
      const status =
        typeof failure === "object" && failure !== null && "status" in failure
          ? failure.status
          : null;
      if (typeof status !== "number" || status >= 500) setUnknown(true);
      else
        setError(failureMessage(failure, "Could not submit the application."));
    } finally {
      busy.current = false;
      setReview(null);
    }
  }

  return (
    <section className="space-y-5">
      <header className="space-y-3">
        <Link href={historyPath} className={`${historyLink} ${secondaryStyle}`}>
          Back to loans
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Apply for a loan
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Review the terms and estimated monthly installment before submitting
            your simulated application.
          </p>
        </div>
      </header>
      {result ? (
        <Card className="max-w-2xl space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              ref={resultHeading}
              tabIndex={-1}
              className="text-lg font-semibold outline-none"
            >
              Application submitted
            </h2>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
              {loanStatuses[result.status]}
            </span>
          </div>
          <DetailFields
            fields={[
              [
                "Loan",
                `${loanLabels[result.type]} · ${formatTaka(result.requestedPrincipalPoisha)}`,
              ],
              ["Submitted", formatDhakaFullTimestamp(result.createdAt)],
            ]}
          />
          <Link href={historyPath} className={`${historyLink} ${primaryStyle}`}>
            View applications
          </Link>
        </Card>
      ) : (
        <Card className="max-w-3xl space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Application details</h2>
          {unknown && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p role="alert">
                The submission outcome is unknown. Check your applications
                before submitting again.
              </p>
              <Link
                href={historyPath}
                className={`${historyLink} ${secondaryStyle}`}
              >
                Check applications
              </Link>
            </div>
          )}
          {(catalog.isFetching || accounts.isFetching) && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading application options…
            </p>
          )}
          {catalog.isError && (
            <div className="space-y-2">
              <ErrorMessage message="Could not load loan products." />
              <Button
                className={secondaryStyle}
                onClick={() => void catalog.refetch()}
              >
                Reload loan products
              </Button>
            </div>
          )}
          {accounts.isError && (
            <div className="space-y-2">
              <ErrorMessage message="Could not load your accounts." />
              <Button
                className={secondaryStyle}
                onClick={() => void accounts.refetch()}
              >
                Reload accounts
              </Button>
            </div>
          )}
          {accounts.currentData && !rows.some((item) => !item.restriction) && (
            <p className="text-sm text-muted-foreground">
              There are no active accounts on this page.
            </p>
          )}
          <form method="post" onSubmit={prepare} className="space-y-4">
            <fieldset
              disabled={unknown || estimating || submitting}
              className="min-w-0 space-y-4"
            >
              <label className="flex flex-col gap-2 text-sm font-medium">
                Loan type
                <select
                  className={fieldStyle}
                  required
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value);
                    setError("");
                  }}
                >
                  <option value="">Select a loan type</option>
                  {catalog.currentData?.products.map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {product && (
                <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  <p>
                    {amountRange(product)} · {product.minTermMonths}–
                    {product.maxTermMonths} months
                  </p>
                  <p className="mt-1">
                    {product.annualRateBps / 100}% fixed annual interest on the
                    remaining principal
                  </p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="amount"
                  label="Requested amount (BDT)"
                  inputMode="decimal"
                  required
                  maxLength={20}
                />
                <Field
                  name="term"
                  label="Term (months)"
                  type="number"
                  required
                  min={product?.minTermMonths ?? 6}
                  max={product?.maxTermMonths ?? 60}
                  step={1}
                />
                <Field
                  name="income"
                  label="Declared monthly income (BDT)"
                  inputMode="decimal"
                  required
                  maxLength={20}
                />
                <Field
                  name="employment"
                  label="Employment status"
                  required
                  maxLength={120}
                />
              </div>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Disbursement account
                <select
                  className={fieldStyle}
                  required
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  <option value="">Select an active account</option>
                  {rows.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                      disabled={Boolean(item.restriction)}
                    >
                      {accountTypes[item.type]} · {item.accountNumber}
                      {item.restriction
                        ? ` · ${accountStatuses[item.status]}`
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
              <label className="flex flex-col gap-2 text-sm font-medium">
                Application description
                <textarea
                  className={`${fieldStyle} py-2`}
                  name="description"
                  required
                  maxLength={300}
                  rows={3}
                />
              </label>
            </fieldset>
            <ErrorMessage message={error} />
            <Button
              ref={reviewButton}
              type="submit"
              className={primaryStyle}
              disabled={
                !product ||
                !account ||
                Boolean(account.restriction) ||
                unknown ||
                estimating ||
                submitting
              }
            >
              {estimating ? "Estimating…" : "Review application"}
            </Button>
          </form>
        </Card>
      )}
      <AlertDialog.Root
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !busy.current) setReview(null);
        }}
      >
        {review && (
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-40 bg-foreground/55" />
            <AlertDialog.Content
              onEscapeKeyDown={(event) => {
                if (busy.current) event.preventDefault();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                requestAnimationFrame(() =>
                  (resultHeading.current ?? reviewButton.current)?.focus(),
                );
              }}
              className="fixed top-1/2 left-1/2 z-50 max-h-[90svh] w-[calc(100%-2rem)] max-w-lg -translate-1/2 overflow-auto rounded-xl border bg-card p-5 shadow-lg sm:p-6"
            >
              <AlertDialog.Title className="text-lg font-semibold">
                Review loan application
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                This estimate uses your requested terms. The final installment
                may differ slightly due to rounding.
              </AlertDialog.Description>
              <div className="mt-4 border-y py-4">
                <DetailFields
                  fields={[
                    ["Loan type", loanLabels[review.application.type]],
                    [
                      "Requested amount",
                      formatTaka(review.application.requestedPrincipalPoisha),
                    ],
                    ["Term", `${review.application.termMonths} months`],
                    ["Annual interest", `${review.annualRateBps / 100}%`],
                    [
                      "Estimated monthly installment",
                      formatTaka(review.emiPoisha),
                    ],
                    ["Disbursement account", review.accountNumber],
                    [
                      "Declared monthly income",
                      formatTaka(review.application.monthlyIncomePoisha),
                    ],
                    ["Employment status", review.application.employmentStatus],
                  ]}
                />
                <p className="mt-3 break-words text-sm">
                  {review.application.description}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <AlertDialog.Cancel asChild>
                  <Button className={secondaryStyle} disabled={submitting}>
                    Back to edit
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  className={primaryStyle}
                  disabled={submitting}
                  onClick={() => void confirm()}
                >
                  {submitting ? "Submitting…" : "Submit application"}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        )}
      </AlertDialog.Root>
    </section>
  );
}
