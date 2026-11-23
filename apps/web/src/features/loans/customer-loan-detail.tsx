"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailSkeleton, FieldSkeleton } from "@/components/ui/skeleton";
import { accountTypes, formatTaka } from "@/features/accounts/account-display";
import { useOwnedAccountsQuery } from "@/features/management/management-api";
import { DetailFields, Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  Field,
  fieldStyle,
  onboardingError,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { historyLink } from "@/features/transactions/transaction-display";
import { useTransactionPinStatusQuery } from "@/features/transactions/transfer-api";
import { formatDhakaDay } from "@/lib/dhaka-date";
import { LoanActionDialog } from "./loan-action-dialog";
import { LoanRepaymentHistory, LoanTimeline } from "./loan-history";
import {
  loanLabels,
  loanStatuses,
  useCustomerLoanDetailQuery,
  useRepayLoanMutation,
  useSettleLoanMutation,
  type SettlementQuote,
  type LoanInstallment,
} from "./loans-api";

function dueDay(date: string) {
  return formatDhakaDay(`${date}T00:00:00+06:00`);
}

function RepaymentFields() {
  const [page, setPage] = useState(1);
  const [accountId, setAccountId] = useState("");
  const query = useOwnedAccountsQuery(page, {
    refetchOnMountOrArgChange: true,
  });
  const accountPage = query.isError ? undefined : query.currentData;
  const accounts =
    accountPage?.accounts.filter(
      (account) => !account.restriction && account.status === "ACTIVE",
    ) ?? [];
  const selected = accounts.find((account) => account.id === accountId);
  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Pay from account
        {query.isFetching && !query.isError && !query.currentData ? (
          <FieldSkeleton label="Loading accounts" />
        ) : (
          <select
            name="accountId"
            className={`${fieldStyle} min-w-0`}
            required
            value={selected?.id ?? ""}
            onChange={(event) => setAccountId(event.target.value)}
            aria-describedby={selected ? "loan-payment-balance" : undefined}
          >
            <option value="" disabled>
              Choose an eligible account
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.accountNumber} · {accountTypes[account.type]}
              </option>
            ))}
          </select>
        )}
      </label>
      {selected && (
        <p id="loan-payment-balance" className="text-sm text-muted-foreground">
          Available balance {formatTaka(selected.availableBalancePoisha)}
        </p>
      )}
      {query.isError ? (
        <div className="space-y-2">
          <ErrorMessage message="Could not load your accounts." />
          <Button
            className={secondaryStyle}
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        accountPage &&
        !accounts.length && (
          <p className="text-sm text-muted-foreground">
            No active accounts on this page.
          </p>
        )
      )}
      {accountPage && (page > 1 || accountPage.hasNextPage) && (
        <Pager
          page={page}
          next={accountPage.hasNextPage}
          onPage={(next) => {
            setAccountId("");
            setPage(next);
          }}
        />
      )}
      <Field
        label="Transaction PIN"
        name="pin"
        type="password"
        inputMode="numeric"
        pattern="[0-9]{6}"
        autoComplete="off"
        minLength={6}
        maxLength={6}
        required
      />
    </div>
  );
}

const installmentLabels = {
  PAID: "Paid",
  OVERDUE: "Overdue",
  IN_GRACE: "In grace period",
  DUE: "Due",
  SCHEDULED: "Scheduled",
  CLOSED: "Closed by settlement",
};

function InstallmentPayment({
  id,
  entry,
  onSuccessFocus,
}: {
  id: string;
  entry: LoanInstallment;
  onSuccessFocus: () => void;
}) {
  const [repay] = useRepayLoanMutation();
  const amount = entry.amountDuePoisha ?? entry.totalPoisha;
  return (
    <LoanActionDialog
      label={`Pay installment ${entry.number}`}
      title={`Pay installment ${entry.number}?`}
      confirmLabel="Confirm payment"
      description={`Pay ${formatTaka(amount)} including ${formatTaka(entry.principalPoisha)} principal, ${formatTaka(entry.interestPoisha)} scheduled interest, and ${formatTaka(entry.overdueInterestPoisha)} overdue interest.`}
      fields={<RepaymentFields />}
      onSuccessFocus={onSuccessFocus}
      onConfirm={async (data) => {
        const receipt = await repay({
          id,
          number: entry.number,
          accountId: String(data.get("accountId") ?? ""),
          pin: String(data.get("pin") ?? ""),
          expectedAmountPoisha: amount,
        }).unwrap();
        return `Payment of ${formatTaka(receipt.amountPoisha)} posted. Reference ${receipt.reference}.`;
      }}
    />
  );
}

function SettlementPayment({
  id,
  quote,
  onSuccessFocus,
}: {
  id: string;
  quote: SettlementQuote;
  onSuccessFocus: () => void;
}) {
  const [settle] = useSettleLoanMutation();
  return (
    <LoanActionDialog
      label="Settle loan early"
      title="Settle this loan in full?"
      confirmLabel="Confirm settlement"
      description={`Pay ${formatTaka(quote.amountPoisha)} to close the loan. This includes remaining principal and interest accrued through today (Dhaka).`}
      fields={<RepaymentFields />}
      onSuccessFocus={onSuccessFocus}
      onConfirm={async (data) => {
        const receipt = await settle({
          id,
          accountId: String(data.get("accountId") ?? ""),
          pin: String(data.get("pin") ?? ""),
          expectedAmountPoisha: quote.amountPoisha,
        }).unwrap();
        return `Settlement of ${formatTaka(receipt.amountPoisha)} posted. Reference ${receipt.reference}.`;
      }}
    />
  );
}

export function CustomerLoanDetail({ id }: { id: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useCustomerLoanDetailQuery(id, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const detail = query.currentData;
  const installments = detail?.installments ?? [];
  const showRepaymentHistory =
    detail?.loan.status === "ACTIVE" || detail?.loan.status === "COMPLETED";
  const next =
    detail?.loan.status === "ACTIVE"
      ? installments.find((entry) => !entry.paidAt)
      : undefined;
  const hasPayment =
    Boolean(detail?.settlementQuote) ||
    installments.some((entry) => entry.payable);
  const pin = useTransactionPinStatusQuery(undefined, { skip: !hasPayment });

  return (
    <section className="max-w-4xl space-y-5">
      <Link
        className={`${historyLink} ${secondaryStyle}`}
        href="/customer/loans"
      >
        Back to loans
      </Link>
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-3xl font-semibold tracking-tight"
      >
        Loan details
      </h1>
      {query.isError ? (
        <div className="space-y-2">
          <ErrorMessage
            message={onboardingError(query.error, "Could not load the loan.")}
          />
          <Button
            className={secondaryStyle}
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : detail ? (
        <>
          <Card className="gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {loanLabels[detail.loan.type]} loan
              </h2>
              <p className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                {loanStatuses[detail.loan.status]}
              </p>
            </div>
            <DetailFields
              fields={[
                [
                  "Requested principal",
                  formatTaka(detail.loan.requestedPrincipalPoisha),
                ],
                ["Term", `${detail.loan.termMonths} months`],
                ["Annual interest rate", `${detail.loan.annualRateBps / 100}%`],
                ...(installments[0]
                  ? [
                      [
                        "Monthly EMI",
                        formatTaka(installments[0].totalPoisha),
                      ] as [string, string],
                    ]
                  : []),
                ...(detail.loan.approvedPrincipalPoisha !== null
                  ? [
                      [
                        "Approved principal",
                        formatTaka(detail.loan.approvedPrincipalPoisha),
                      ] as [string, string],
                    ]
                  : []),
                ...(detail.loan.remainingPrincipalPoisha !== null
                  ? [
                      [
                        "Outstanding principal",
                        formatTaka(detail.loan.remainingPrincipalPoisha),
                      ] as [string, string],
                    ]
                  : []),
                ...(next
                  ? [
                      [
                        "Next unpaid installment",
                        `${formatTaka(next.amountDuePoisha ?? next.totalPoisha)} · ${dueDay(next.dueDate)}`,
                      ] as [string, string],
                    ]
                  : []),
              ]}
            />
            {detail.loan.rejectionReason && (
              <p className="break-words text-sm">
                Reason for rejection: {detail.loan.rejectionReason}
              </p>
            )}
            {showRepaymentHistory && (
              <a
                className={`${historyLink} ${secondaryStyle} w-fit`}
                href="#loan-repayment-history"
              >
                Jump to repayment history
              </a>
            )}
          </Card>
          <LoanTimeline loan={detail.loan} />
          {detail.settlementQuote && (
            <Card className="gap-3 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Early full settlement</h2>
              <DetailFields
                fields={[
                  [
                    "Remaining principal",
                    formatTaka(detail.settlementQuote.principalPoisha),
                  ],
                  [
                    "Accrued scheduled interest",
                    formatTaka(detail.settlementQuote.scheduledInterestPoisha),
                  ],
                  [
                    "Overdue interest",
                    formatTaka(detail.settlementQuote.overdueInterestPoisha),
                  ],
                  [
                    "Settlement total",
                    formatTaka(detail.settlementQuote.amountPoisha),
                  ],
                ]}
              />
              {pin.data?.configured && (
                <SettlementPayment
                  id={id}
                  quote={detail.settlementQuote}
                  onSuccessFocus={() => heading.current?.focus()}
                />
              )}
            </Card>
          )}
          {installments.length > 0 && (
            <Card className="gap-3 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Repayment schedule</h2>
              {hasPayment && pin.isFetching && !pin.currentData && (
                <FieldSkeleton label="Checking transaction PIN setup" />
              )}
              {hasPayment && pin.isError && (
                <div className="space-y-2">
                  <ErrorMessage message="Could not check your transaction PIN setup." />
                  <Button
                    className={secondaryStyle}
                    onClick={() => void pin.refetch()}
                  >
                    Try again
                  </Button>
                </div>
              )}
              {hasPayment && pin.data && !pin.data.configured && (
                <p className="text-sm">
                  <Link
                    href="/customer/transfer"
                    className="font-semibold text-primary underline underline-offset-4"
                  >
                    Set up your transaction PIN
                  </Link>{" "}
                  to pay an installment.
                </p>
              )}
              <ol className="divide-y">
                {installments.map((entry) => (
                  <li key={entry.number} className="space-y-3 py-4 first:pt-2">
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="font-semibold">
                        Installment {entry.number}
                      </h3>
                      <p className="text-sm font-medium">
                        {installmentLabels[entry.status]}
                      </p>
                    </div>
                    <DetailFields
                      fields={[
                        ["Due date", dueDay(entry.dueDate)],
                        [
                          "Scheduled installment",
                          formatTaka(entry.totalPoisha),
                        ],
                        ["Principal", formatTaka(entry.principalPoisha)],
                        [
                          "Scheduled interest",
                          formatTaka(entry.interestPoisha),
                        ],
                        ...(entry.overdueInterestPoisha !== "0"
                          ? [
                              [
                                "Overdue interest",
                                formatTaka(entry.overdueInterestPoisha),
                              ] as [string, string],
                            ]
                          : []),
                        ...(entry.amountDuePoisha !== null &&
                        entry.status !== "SCHEDULED"
                          ? [
                              [
                                "Amount due",
                                formatTaka(entry.amountDuePoisha),
                              ] as [string, string],
                            ]
                          : []),
                      ]}
                    />
                    {entry.payable && pin.data?.configured && (
                      <InstallmentPayment
                        id={id}
                        entry={entry}
                        onSuccessFocus={() => heading.current?.focus()}
                      />
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {showRepaymentHistory && (
            <LoanRepaymentHistory
              installments={installments}
              disbursementReference={detail.disbursementReference}
              settlement={detail.settlement}
              workspace="customer"
            />
          )}
        </>
      ) : (
        <DetailSkeleton label="Loading loan details" />
      )}
    </section>
  );
}
