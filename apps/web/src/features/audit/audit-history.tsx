"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  Field,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { baseApi } from "@/lib/api/base-api";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";

const categories = {
  MANAGEMENT: "Account and customer management",
  CASH_REQUEST: "Cash requests",
  LOAN: "Loans",
  TRANSFER: "Transfer reversals",
  FLAG: "Transaction flags",
};

type Event = {
  category: keyof typeof categories;
  eventId: string;
  action: string;
  subjectId: string;
  actorId: string | null;
  actorName: string | null;
  occurredAt: string;
};
type Filters = {
  search?: string;
  category?: string;
  from?: string;
  to?: string;
};
const { useAuditQuery } = baseApi.injectEndpoints({
  endpoints: (build) => ({
    audit: build.query<
      { events: Event[]; hasNextPage: boolean },
      Filters & { page: number }
    >({
      query: (params) => ({ url: "/audit", params, cache: "no-store" }),
      keepUnusedDataFor: 0,
    }),
  }),
});

function relatedRecord(event: Event) {
  switch (event.category) {
    case "MANAGEMENT":
      return event.action.startsWith("PROFILE_")
        ? `/admin/management/customers?id=${event.subjectId}`
        : null;
    case "LOAN":
      return `/admin/loans/review/${event.subjectId}`;
    case "CASH_REQUEST":
      return `/admin/cash-requests/review/${event.subjectId}`;
    case "TRANSFER":
    case "FLAG":
      return `/admin/transactions/${event.subjectId}`;
    default:
      return null;
  }
}

export function AuditHistory() {
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [dateError, setDateError] = useState("");
  const query = useAuditQuery(
    { ...filters, page },
    { refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) =>
      String(data.get(name) ?? "").trim() || undefined;
    const from = value("from");
    const to = value("to");
    if (from && to && from > to) {
      setDateError("The From date must be on or before the To date.");
      return;
    }
    setDateError("");
    setPage(1);
    setFilters({
      search: value("search"),
      category: value("category"),
      from,
      to,
    });
  }

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold sm:text-3xl">Audit history</h1>
      <Card className="@container space-y-3 p-4 sm:p-5">
        <form
          onSubmit={search}
          className="grid items-start gap-3 @min-[30rem]:grid-cols-2 @min-[54rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <Field
            label="Actor, record ID or action"
            type="search"
            name="search"
            placeholder="Search audit events"
            maxLength={120}
          />
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Category
            <Select name="category">
              <option value="">All categories</option>
              {Object.entries(categories).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <Field
            name="from"
            label="From (Dhaka)"
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            onChange={() => setDateError("")}
          />
          <Field
            name="to"
            label="To (Dhaka)"
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            onChange={() => setDateError("")}
          />
          <Button
            className={`${primaryStyle} self-end @min-[30rem]:col-span-2 @min-[30rem]:justify-self-end @min-[54rem]:col-span-1`}
            type="submit"
          >
            Search
          </Button>
        </form>
        <ErrorMessage message={dateError} />
      </Card>
      <Card className="p-4 sm:p-5">
        {query.isFetching && !query.isError && !query.currentData && (
          <ListSkeleton label="Loading audit history" rowClassName="px-0" />
        )}
        {query.isError ? (
          <div className="space-y-2">
            <ErrorMessage message="Could not load audit history. Check the date range or try again." />
            <Button
              className={secondaryStyle}
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : query.currentData?.events.length ? (
          <ul className="divide-y">
            {query.currentData.events.map((entry) => {
              const href = relatedRecord(entry);
              return (
                <li
                  key={`${entry.category}-${entry.eventId}-${entry.action}`}
                  className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr]"
                >
                  <div>
                    <p className="font-semibold capitalize">
                      {entry.action.toLowerCase().replaceAll("_", " ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {categories[entry.category]}
                    </p>
                    <p className="break-all text-sm">{entry.subjectId}</p>
                    {href && (
                      <Link
                        href={href}
                        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
                      >
                        View record
                      </Link>
                    )}
                  </div>
                  <div>
                    <p className="break-words text-sm">
                      {entry.actorName ?? entry.actorId ?? "Actor unavailable"}
                    </p>
                    <time
                      className="text-sm text-muted-foreground"
                      dateTime={entry.occurredAt}
                    >
                      {formatDhakaTimestamp(entry.occurredAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          query.currentData && (
            <p className="text-sm text-muted-foreground">
              No audit events match your search.
            </p>
          )
        )}
        {(page > 1 || query.currentData?.hasNextPage) && (
          <Pager
            page={page}
            next={query.currentData?.hasNextPage ?? false}
            onPage={setPage}
          />
        )}
      </Card>
    </section>
  );
}
