"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  accountStatuses,
  accountTypes,
  customerStatuses,
  formatTaka,
  verificationStatuses,
} from "@/features/accounts/account-display";
import {
  ErrorMessage,
  Field,
  fieldStyle,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { AccountDetails, CustomerDetails } from "./management-details";
import {
  useAccountDirectoryQuery,
  useCustomerDirectoryQuery,
  type Section,
} from "./management-api";
import { Pager, Status } from "./management-ui";

function Filter({
  name,
  label,
  values,
  selected,
}: {
  name: string;
  label: string;
  values: Record<string, string>;
  selected: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      <select name={name} defaultValue={selected} className={fieldStyle}>
        <option value="">All</option>
        {Object.entries(values).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Table({
  title,
  headings,
  children,
}: {
  title: string;
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={title}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-primary"
    >
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">{title}</caption>
        <thead className="border-b bg-muted text-muted-foreground">
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function Directory({
  section,
  admin,
}: {
  section: Section;
  admin: boolean;
}) {
  const customerMode = section === "customers";
  const pathname = admin ? "/admin" : "/staff";
  const [selected, setSelected] = useState<string>();
  const [filters, setFilters] = useState({
    q: "",
    first: "",
    second: "",
    page: 1,
  });
  const { q, first, second, page } = filters;
  const customers = useCustomerDirectoryQuery(
    {
      q,
      page,
      verification: first || undefined,
      accessStatus: second || undefined,
    },
    { skip: !customerMode || !!selected },
  );
  const accounts = useAccountDirectoryQuery(
    { q, page, type: first || undefined, status: second || undefined },
    { skip: customerMode || !!selected },
  );
  const state = customerMode ? customers : accounts;
  const hasRows = customerMode
    ? customers.currentData?.customers.length
    : accounts.currentData?.accounts.length;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFilters({
      q: String(form.get("q") ?? "").trim(),
      first: String(form.get("first") ?? ""),
      second: String(form.get("second") ?? ""),
      page: 1,
    });
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {customerMode ? "Customers" : "Bank accounts"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customerMode
              ? "Find and review customer records."
              : "Find and review bank accounts."}
          </p>
        </div>
        {selected ? (
          <Button
            className={secondaryStyle}
            onClick={() => setSelected(undefined)}
          >
            Back to results
          </Button>
        ) : (
          <Link
            href={`${pathname}/onboarding`}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Customer onboarding
          </Link>
        )}
      </header>
      {selected ? (
        customerMode ? (
          <CustomerDetails id={selected} admin={admin} />
        ) : (
          <AccountDetails id={selected} admin={admin} />
        )
      ) : (
        <Card className="space-y-5 p-4 sm:p-6">
          <form
            method="post"
            onSubmit={search}
            className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"
          >
            <Field
              name="q"
              label={
                customerMode
                  ? "Search by name, email, or identity reference"
                  : "Search by account number, name, or email"
              }
              defaultValue={q}
              maxLength={160}
            />
            <Filter
              name="first"
              label={customerMode ? "Verification" : "Type"}
              values={customerMode ? verificationStatuses : accountTypes}
              selected={first}
            />
            <Filter
              name="second"
              label={customerMode ? "Customer access" : "Account status"}
              values={customerMode ? customerStatuses : accountStatuses}
              selected={second}
            />
            <Button type="submit" className={primaryStyle}>
              Apply filters
            </Button>
          </form>
          {state.isFetching && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading results…
            </p>
          )}
          {state.isError && (
            <div className="space-y-3">
              <ErrorMessage
                message={onboardingError(
                  state.error,
                  "Unable to load records.",
                )}
              />
              <Button
                className={secondaryStyle}
                onClick={() => void state.refetch()}
              >
                Try again
              </Button>
            </div>
          )}
          {!state.isError && state.currentData && !hasRows && (
            <p className="text-sm text-muted-foreground">
              No records match your filters.
            </p>
          )}
          {!state.isError &&
            !!hasRows &&
            (customerMode ? (
              <Table
                title="Customer results"
                headings={["Customer", "Verification", "Access", "Actions"]}
              >
                {customers.currentData?.customers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{customer.fullName}</p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {customer.email}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Status
                        value={customer.verificationStatus}
                        labels={verificationStatuses}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Status
                        value={customer.accessStatus}
                        labels={customerStatuses}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        aria-label={`View ${customer.fullName}`}
                        className={secondaryStyle}
                        onClick={() => setSelected(customer.id)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Table
                title="Bank account results"
                headings={[
                  "Account",
                  "Customer",
                  "Status",
                  "Balance",
                  "Actions",
                ]}
              >
                {accounts.currentData?.accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">
                        {accountTypes[account.type]} ••••{" "}
                        {account.accountNumber.slice(-4)}
                      </p>
                    </td>
                    <td className="px-4 py-3">{account.ownerName}</td>
                    <td className="px-4 py-3">
                      <Status value={account.status} labels={accountStatuses} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatTaka(account.balancePoisha)}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        aria-label={`View account ending in ${account.accountNumber.slice(-4)}`}
                        className={secondaryStyle}
                        onClick={() => setSelected(account.id)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            ))}
          <Pager
            page={page}
            next={!!state.currentData?.hasNextPage}
            onPage={(next) => setFilters({ ...filters, page: next })}
          />
        </Card>
      )}
    </section>
  );
}
