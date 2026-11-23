"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  Field,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaDay } from "@/lib/dhaka-date";
import type { RootState } from "@/lib/store/store";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  directions,
  TransactionAmount,
  TransactionStatus,
} from "./transaction-display";
import {
  transactionStatuses,
  transactionTypes,
  useTransactionHistoryQuery,
  type HistoryFilters,
  type Transaction,
} from "./transactions-api";
import { transactionsSlice } from "./transactions-slice";

function TransactionLink({
  root,
  transaction,
}: {
  root: string;
  transaction: Transaction;
}) {
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded break-all text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
      aria-label={`View transaction ${transaction.reference}`}
      href={`${root}/${transaction.reference}`}
    >
      {transaction.reference}
    </Link>
  );
}

function AccountSummary({ transaction }: { transaction: Transaction }) {
  return (
    <div className="space-y-0.5 text-sm">
      {transaction.senderNumber && (
        <p>
          <span className="text-muted-foreground">From</span>{" "}
          {transaction.senderNumber}
        </p>
      )}
      {transaction.receiverNumber && (
        <p>
          <span className="text-muted-foreground">To</span>{" "}
          {transaction.receiverNumber}
        </p>
      )}
    </div>
  );
}

function TypeSummary({ transaction }: { transaction: Transaction }) {
  return (
    <div>
      <p className="font-medium">{transactionTypes[transaction.type]}</p>
      {transaction.direction && (
        <p className="text-xs text-muted-foreground">
          {directions[transaction.direction]}
        </p>
      )}
    </div>
  );
}

export function TransactionHistory({ root }: { root: string }) {
  const dispatch = useDispatch();
  const filters = useSelector((state: RootState) => state.transactions);
  const { page, ...savedFilters } = filters;
  const [draft, setDraft] = useState(savedFilters);
  const [error, setError] = useState("");

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setError("The end date must be on or after the start date.");
      return;
    }
    setError("");
    const values = {
      ...draft,
      reference: draft.reference?.trim() || undefined,
    };
    dispatch(transactionsSlice.actions.setTransactionFilters(values));
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Transactions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Search by transaction reference or filter by date, type, and status.
        </p>
      </header>
      <Card className="p-4 sm:p-5">
        <form onSubmit={apply} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Filters</h2>
            <p
              id="transaction-filter-timezone"
              className="text-xs text-muted-foreground"
            >
              Dates use Dhaka time.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Field
              label="Reference"
              title="Use hexadecimal characters and hyphens from the transaction reference."
              placeholder="Reference or prefix"
              pattern="[0-9a-fA-F\-]*"
              maxLength={36}
              value={draft.reference ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, reference: event.target.value })
              }
            />
            <Field
              label="From date"
              aria-describedby="transaction-filter-timezone"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={draft.from ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, from: event.target.value || undefined })
              }
            />
            <Field
              label="To date"
              aria-describedby="transaction-filter-timezone"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={draft.to ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, to: event.target.value || undefined })
              }
            />
            <Combobox
              label="Type"
              className="flex min-w-0 flex-col gap-2 text-sm font-medium"
              value={draft.type ?? ""}
              onValueChange={(selectedValue) =>
                setDraft({ ...draft, type: selectedValue || undefined })
              }
              options={[
                { value: "", label: "All types" },
                ...Object.entries(transactionTypes).map(([value, label]) => ({
                  value: value,
                  label: label,
                })),
              ]}
            />
            <Combobox
              label="Status"
              className="flex min-w-0 flex-col gap-2 text-sm font-medium"
              value={draft.status ?? ""}
              onValueChange={(selectedValue) =>
                setDraft({
                  ...draft,
                  status: selectedValue || undefined,
                })
              }
              options={[
                { value: "", label: "All statuses" },
                ...Object.entries(transactionStatuses).map(
                  ([value, label]) => ({ value: value, label: label }),
                ),
              ]}
            />
          </div>
          <ErrorMessage message={error} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className={primaryStyle}>
              Apply filters
            </Button>
            <Button
              className={secondaryStyle}
              onClick={() => {
                setDraft({});
                setError("");
                dispatch(transactionsSlice.actions.resetTransactionFilters());
              }}
            >
              Clear filters
            </Button>
          </div>
        </form>
      </Card>
      <TransactionResults
        root={root}
        filters={{ page, ...savedFilters }}
        onPage={(target) =>
          dispatch(transactionsSlice.actions.setTransactionPage(target))
        }
      />
    </section>
  );
}

export function TransactionResults({
  root,
  filters,
  onPage,
}: {
  root: string;
  filters: HistoryFilters & { customerId?: string };
  onPage: (page: number) => void;
}) {
  const { page } = filters;
  const query = useTransactionHistoryQuery(filters, {
    refetchOnMountOrArgChange: true,
  });
  const rows = query.currentData?.transactions ?? [];

  return (
    <>
      {query.isFetching && !query.isError && !query.currentData && (
        <Card className="overflow-hidden p-0">
          <ListSkeleton label="Loading transactions" tableAt="lg" />
        </Card>
      )}
      {query.isError && (
        <Card className="space-y-3 p-5">
          <ErrorMessage message="Could not load transactions. Check your filters or try again." />
          <Button
            className={secondaryStyle}
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </Card>
      )}
      {!query.isError && query.currentData && (
        <Card className="overflow-hidden p-0" aria-busy={query.isFetching}>
          {rows.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              {filters.customerId
                ? "No transactions for this customer."
                : "No transactions match your filters."}
            </p>
          ) : (
            <>
              <ul className="divide-y lg:hidden">
                {rows.map((transaction) => (
                  <li key={transaction.reference} className="space-y-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                      <TypeSummary transaction={transaction} />
                      <TransactionAmount transaction={transaction} />
                    </div>
                    <AccountSummary transaction={transaction} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <time
                        className="text-sm text-muted-foreground"
                        dateTime={transaction.createdAt}
                      >
                        {formatDhakaDay(transaction.createdAt)}
                      </time>
                      <TransactionStatus status={transaction.status} />
                    </div>
                    <TransactionLink root={root} transaction={transaction} />
                  </li>
                ))}
              </ul>
              <table className="hidden w-full table-fixed text-left text-sm lg:table">
                <caption className="sr-only">Transaction history</caption>
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-[23%] px-4 py-3">
                      Reference
                    </th>
                    <th scope="col" className="w-[15%] px-4 py-3">
                      Date
                    </th>
                    <th scope="col" className="w-[18%] px-4 py-3">
                      Type
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Accounts
                    </th>
                    <th scope="col" className="w-[15%] px-4 py-3 text-right">
                      Amount
                    </th>
                    <th scope="col" className="w-[14%] px-4 py-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((transaction) => (
                    <tr key={transaction.reference}>
                      <td className="px-4 py-2">
                        <TransactionLink
                          root={root}
                          transaction={transaction}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <time dateTime={transaction.createdAt}>
                          {formatDhakaDay(transaction.createdAt)}
                        </time>
                      </td>
                      <td className="px-4 py-2">
                        <TypeSummary transaction={transaction} />
                      </td>
                      <td className="px-4 py-2">
                        <AccountSummary transaction={transaction} />
                      </td>
                      <td className="break-all px-4 py-2 text-right">
                        <TransactionAmount transaction={transaction} />
                      </td>
                      <td className="px-4 py-2">
                        <TransactionStatus status={transaction.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <div className="px-4 [&:empty]:hidden [&:not(:empty)]:py-3">
            <Pager
              page={page}
              next={query.currentData.hasNextPage}
              onPage={onPage}
            />
          </div>
        </Card>
      )}
    </>
  );
}
