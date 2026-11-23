"use client";

import { TakaAmount } from "@/features/accounts/taka-amount";
import { skipToken } from "@reduxjs/toolkit/query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FieldSkeleton,
  ListSkeleton,
  LoadingRegion,
  Skeleton,
} from "@/components/ui/skeleton";
import {
  accountStatuses,
  accountTypes,
} from "@/features/accounts/account-display";
import {
  useOwnedAccountQuery,
  useOwnedAccountsQuery,
  type OwnedAccount,
} from "@/features/management/management-api";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import {
  directions,
  historyLink,
  TransactionAmount,
  TransactionStatus,
} from "@/features/transactions/transaction-display";
import { transactionTypes } from "@/features/transactions/transactions-api";
import { formatDhakaDay, formatDhakaTimestamp } from "@/lib/dhaka-date";
import { cn } from "@/lib/utils";
import { ReportChartsSkeleton } from "./report-skeleton";
import styles from "./customer-overview.module.css";
import { useCustomerReportQuery, type CustomerReport } from "./reports-api";

const CustomerReportCharts = dynamic(
  () =>
    import("./customer-report-charts").then(
      (module) => module.CustomerReportCharts,
    ),
  {
    ssr: false,
    loading: () => (
      <ReportChartsSkeleton gridClassName={styles.chartGrid} customer />
    ),
  },
);

const accountOptions = {
  refetchOnMountOrArgChange: true,
};
const countFormat = new Intl.NumberFormat("en-BD");
const periodDay = (date: string) => formatDhakaDay(`${date}T12:00:00+06:00`);
const accountLabel = (account: OwnedAccount) =>
  `${accountTypes[account.type]} ending ${account.accountNumber.slice(-4)}`;

function BalanceCard({
  report,
  account,
  scope,
}: {
  report: CustomerReport;
  account?: OwnedAccount;
  scope: string;
}) {
  const { summary, period } = report;
  const balanceLabel =
    report.accountId === null
      ? "Total balance"
      : account?.status === "ACTIVE"
        ? "Available balance"
        : "Account balance";
  return (
    <Card className="min-w-0 border-navy bg-navy p-4 text-navy-foreground sm:p-5">
      <h2 className="font-semibold">{scope}</h2>
      {account && (
        <p className="mt-1 text-sm text-navy-foreground/80">
          Account {account.accountNumber}{" "}
          <span className="mx-1" aria-hidden="true">
            /
          </span>{" "}
          {accountStatuses[account.status]}
        </p>
      )}
      {account?.restriction && (
        <p className="mt-2 text-sm text-brand-accent">{account.restriction}</p>
      )}
      {summary.accountCount === 0 ? (
        <p className="mt-4 text-sm text-navy-foreground/80">
          You don&apos;t have any bank accounts yet.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
            <div className="col-span-2 min-w-0 border-b border-navy-foreground/20 pb-4">
              <dt className="text-sm text-navy-foreground/80">
                {balanceLabel}
              </dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight break-words tabular-nums sm:text-4xl">
                <TakaAmount poisha={summary.balancePoisha} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-navy-foreground/80">
                Total deposits
              </dt>
              <dd className="mt-1 text-xl font-semibold break-words tabular-nums">
                <TakaAmount poisha={summary.depositsPoisha} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-navy-foreground/80">
                Total withdrawals
              </dt>
              <dd className="mt-1 text-xl font-semibold break-words tabular-nums">
                <TakaAmount poisha={summary.withdrawalsPoisha} />
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-navy-foreground/80">
            Completed activity from{" "}
            <time dateTime={period.from}>{periodDay(period.from)}</time> to{" "}
            <time dateTime={period.to}>{periodDay(period.to)}</time>
          </p>
          {(report.accountId === null || account?.status === "ACTIVE") && (
            <nav
              aria-label="Banking actions"
              className="mt-4 flex flex-wrap gap-2"
            >
              <Link
                className={`${historyLink} ${primaryStyle} focus-visible:outline-brand-accent`}
                href="/customer/transfer"
              >
                Transfer
              </Link>
              <Link
                className={`${historyLink} border border-navy-foreground/45 text-navy-foreground hover:bg-navy-foreground/10 focus-visible:outline-brand-accent`}
                href="/customer/cash-requests/deposit"
              >
                Deposit
              </Link>
              <Link
                className={`${historyLink} border border-navy-foreground/45 text-navy-foreground hover:bg-navy-foreground/10 focus-visible:outline-brand-accent`}
                href="/customer/cash-requests/withdrawal"
              >
                Withdraw
              </Link>
            </nav>
          )}
        </>
      )}
    </Card>
  );
}

function ActiveLoans({ report }: { report: CustomerReport }) {
  const { activeLoans, outstandingPrincipalPoisha } = report.summary;
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">Active loans</h2>
        <Link
          className={`${historyLink} ${secondaryStyle}`}
          href="/customer/loans"
        >
          View loans
        </Link>
      </div>
      {activeLoans ? (
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Loan count</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {countFormat.format(activeLoans)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">
              Outstanding principal
            </dt>
            <dd className="mt-1 text-xl font-semibold break-words tabular-nums">
              <TakaAmount poisha={outstandingPrincipalPoisha} />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {report.accountId
            ? "No active loans for this disbursement account."
            : "You have no active loans."}
        </p>
      )}
    </Card>
  );
}

function RecentTransactions({
  report,
  scope,
}: {
  report: CustomerReport;
  scope: string;
}) {
  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Recent transactions</h2>
          <p className="mt-1 text-sm text-muted-foreground">{scope}</p>
        </div>
        <Link
          className={`${historyLink} ${secondaryStyle}`}
          href="/customer/transactions"
        >
          All transactions
        </Link>
      </div>
      {report.recentTransactions.length ? (
        <ul className="divide-y">
          {report.recentTransactions.map((transaction) => (
            <li key={transaction.reference}>
              <Link
                className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-x-3 gap-y-2 rounded-md p-4 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
                href={`/customer/transactions/${transaction.reference}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold break-words">
                    {transactionTypes[transaction.type]}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {directions[transaction.direction]}
                  </p>
                </div>
                <div className="min-w-0 text-end text-sm break-words">
                  <TransactionAmount transaction={transaction} takaIcon />
                  {transaction.direction === "OUTGOING" &&
                    transaction.feePoisha !== "0" && (
                      <p className="mt-1 text-muted-foreground">
                        Fee <TakaAmount poisha={transaction.feePoisha} />
                      </p>
                    )}
                </div>
                <time
                  className="self-center text-sm text-muted-foreground"
                  dateTime={transaction.createdAt}
                >
                  {formatDhakaTimestamp(transaction.createdAt)}
                </time>
                <div className="justify-self-end">
                  <TransactionStatus status={transaction.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted-foreground sm:p-5">
          No transactions in this reporting period.
        </p>
      )}
    </Card>
  );
}

export function CustomerOverview() {
  const router = useRouter();
  const selectedId = useSearchParams().get("accountId") || null;
  const [page, setPage] = useState(1);
  const [navigating, navigate] = useTransition();
  const accounts = useOwnedAccountsQuery(page, accountOptions);
  const selected = useOwnedAccountQuery(
    selectedId ?? skipToken,
    accountOptions,
  );
  const query = useCustomerReportQuery(
    selectedId === null ? undefined : { accountId: selectedId },
    accountOptions,
  );
  const pageAccounts = accounts.isError
    ? []
    : (accounts.currentData?.accounts ?? []);
  const ownedAccount = selected.currentData?.account;
  const selectedAccount =
    !selected.isError && ownedAccount?.id === selectedId
      ? ownedAccount
      : undefined;
  const account =
    selectedAccount ?? pageAccounts.find((entry) => entry.id === selectedId);
  const scope = account
    ? accountLabel(account)
    : selectedId !== null
      ? "Selected account"
      : "All accounts";
  const report = query.isError ? undefined : query.currentData;
  const busy = navigating || query.isFetching;

  function chooseAccount(id: string) {
    const location = id
      ? `/customer?${new URLSearchParams({ accountId: id })}`
      : "/customer";
    navigate(() => router.push(location, { scroll: false }));
  }

  function refresh() {
    void query.refetch();
    void accounts.refetch();
    if (selectedId !== null) void selected.refetch();
  }

  return (
    <section className={cn(styles.overview, "space-y-5")}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h1 className="min-w-0 text-3xl font-semibold tracking-tight break-words">
          Account overview
        </h1>
        <Button className={secondaryStyle} disabled={busy} onClick={refresh}>
          {query.isError ? "Try again" : "Refresh overview"}
        </Button>
      </header>
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <>
            {(accounts.isFetching &&
              !accounts.isError &&
              !accounts.currentData) ||
            (selected.isFetching && !selected.isError && !account) ? (
              <div className="flex w-full max-w-sm min-w-0 flex-col gap-2 text-sm font-medium">
                <span>Account</span>
                <FieldSkeleton label="Loading account choices" />
              </div>
            ) : (
              <Combobox
                label="Account"
                className="flex w-full max-w-sm min-w-0 flex-col gap-2 text-sm font-medium"
                value={selectedId || ""}
                onValueChange={(selectedValue) => chooseAccount(selectedValue)}
                options={[
                  { value: "", label: "All accounts" },
                  ...(selectedId &&
                  !pageAccounts.some((entry) => entry.id === selectedId)
                    ? [
                        {
                          value: selectedId,
                          label: selectedAccount
                            ? accountLabel(selectedAccount)
                            : "Selected account unavailable",
                          disabled: !selectedAccount,
                        },
                      ]
                    : []),
                  ...pageAccounts.map((entry) => ({
                    value: entry.id,
                    label: accountLabel(entry),
                  })),
                ]}
              />
            )}
          </>
          <Link
            className={`${historyLink} ${secondaryStyle}`}
            href="/customer/accounts"
          >
            Manage accounts
          </Link>
        </div>

        {accounts.isError && (
          <div className="space-y-2">
            <ErrorMessage message="Could not load account choices." />
            <Button
              className={secondaryStyle}
              onClick={() => void accounts.refetch()}
            >
              Reload account choices
            </Button>
          </div>
        )}
        {(page > 1 || accounts.currentData?.hasNextPage) && (
          <Pager
            page={page}
            next={!!accounts.currentData?.hasNextPage}
            onPage={setPage}
          />
        )}
      </Card>

      {query.isError && (
        <div className="space-y-2">
          <ErrorMessage
            message={onboardingError(
              query.error,
              "Could not load your account overview.",
            )}
          />
          {selectedId !== null && (
            <Button
              className={secondaryStyle}
              onClick={() => chooseAccount("")}
            >
              Show all accounts
            </Button>
          )}
        </div>
      )}
      <div className="space-y-5" aria-busy={busy && !!report}>
        {report ? (
          <>
            <div className={styles.dashboardGrid}>
              <div className="min-w-0 space-y-4">
                <BalanceCard report={report} account={account} scope={scope} />
                <ActiveLoans report={report} />
              </div>
              <RecentTransactions report={report} scope={scope} />
            </div>
            <CustomerReportCharts report={report} scope={scope} />
          </>
        ) : (
          !query.isError &&
          busy && (
            <>
              <LoadingRegion label="Loading account activity">
                <div className={styles.dashboardGrid}>
                  <div className="space-y-4">
                    <Card className="min-h-64 border-navy bg-navy p-4 sm:p-5">
                      <Skeleton className="h-5 w-28 bg-white/15" />
                      <Skeleton className="mt-5 h-4 w-24 bg-white/15" />
                      <Skeleton className="mt-2 h-10 w-2/3 bg-white/15" />
                      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
                        <Skeleton className="h-10 bg-white/15" />
                        <Skeleton className="h-10 bg-white/15" />
                      </div>
                      <Skeleton className="mt-4 h-11 w-full bg-white/15" />
                    </Card>
                    <Card className="space-y-4 p-4 sm:p-5">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-10 w-2/3" />
                    </Card>
                  </div>
                  <Card>
                    <div className="space-y-2 border-b p-4 sm:p-5">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                    <ListSkeleton label="Loading recent transactions" />
                  </Card>
                </div>
              </LoadingRegion>
              <ReportChartsSkeleton gridClassName={styles.chartGrid} customer />
            </>
          )
        )}
      </div>
    </section>
  );
}
