import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatTaka } from "@/features/accounts/account-display";
import { secondaryStyle } from "@/features/onboarding/form-ui";
import { historyLink } from "@/features/transactions/transaction-display";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import {
  loanStatuses,
  type LoanInstallment,
  type LoanRecord,
} from "./loans-api";

export function LoanTimeline({
  loan,
  forwardedAt,
}: {
  loan: LoanRecord;
  forwardedAt?: string | null;
}) {
  const events = [
    { label: loanStatuses.PENDING, at: loan.createdAt },
    { label: loanStatuses.UNDER_REVIEW, at: loan.reviewStartedAt },
    { label: "Forwarded to Admin", at: forwardedAt },
    {
      label:
        loan.status === "REJECTED"
          ? loanStatuses.REJECTED
          : loanStatuses.APPROVED,
      at: loan.decidedAt,
    },
    { label: loanStatuses.ACTIVE, at: loan.disbursedAt },
    { label: loanStatuses.COMPLETED, at: loan.completedAt },
  ];
  return (
    <Card className="gap-3 p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Application timeline</h2>
      <ol className="border-s border-border ms-1 ps-4">
        {events.map(
          ({ label, at }) =>
            at && (
              <li
                key={label}
                className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3 last:pb-0 before:absolute before:top-2 before:-start-[1.29rem] before:size-2 before:rounded-full before:bg-primary"
              >
                <span className="text-sm font-medium">{label}</span>
                <time className="text-sm text-muted-foreground" dateTime={at}>
                  {formatDhakaTimestamp(at)}
                </time>
              </li>
            ),
        )}
      </ol>
    </Card>
  );
}

export function LoanRepaymentHistory({
  installments,
  disbursementReference,
  workspace,
}: {
  installments: LoanInstallment[];
  disbursementReference: string | null;
  workspace: "customer" | "admin";
}) {
  const payments = installments
    .flatMap((entry) =>
      entry.paidAt &&
      entry.paidAmountPoisha !== null &&
      entry.repaymentReference
        ? [
            {
              ...entry,
              paidAt: entry.paidAt,
              paidAmountPoisha: entry.paidAmountPoisha,
              repaymentReference: entry.repaymentReference,
            },
          ]
        : [],
    )
    .sort(
      (first, second) =>
        second.paidAt.localeCompare(first.paidAt) ||
        second.number - first.number,
    );
  const receiptLink = `${historyLink} ${secondaryStyle} w-fit`;
  return (
    <Card
      id="loan-repayment-history"
      tabIndex={-1}
      className="scroll-mt-24 gap-3 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Repayment history</h2>
        {disbursementReference && (
          <Link
            className={receiptLink}
            href={`/${workspace}/transactions/${disbursementReference}/receipt`}
          >
            View disbursement receipt
          </Link>
        )}
      </div>
      {payments.length ? (
        <ul className="divide-y">
          {payments.map((payment) => (
            <li
              key={payment.number}
              className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-1 last:pb-0"
            >
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold">
                  Installment {payment.number} ·{" "}
                  {formatTaka(payment.paidAmountPoisha)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  <time dateTime={payment.paidAt}>
                    {formatDhakaTimestamp(payment.paidAt)}
                  </time>
                </p>
                <p className="text-sm text-muted-foreground">
                  Principal {formatTaka(payment.principalPoisha)} · Interest{" "}
                  {formatTaka(payment.interestPoisha)}
                </p>
              </div>
              <Link
                className={receiptLink}
                href={`/${workspace}/transactions/${payment.repaymentReference}/receipt`}
              >
                View payment receipt
                <span className="sr-only">
                  {" "}
                  for installment {payment.number}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No repayments have been posted.
        </p>
      )}
    </Card>
  );
}
