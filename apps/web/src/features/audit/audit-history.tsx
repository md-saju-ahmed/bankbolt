"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  fieldStyle,
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
  const query = useAuditQuery(
    { ...filters, page },
    { refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) =>
      String(data.get(name) ?? "").trim() || undefined;
    setPage(1);
    setFilters({
      search: value("search"),
      category: value("category"),
      from: value("from"),
      to: value("to"),
    });
  }

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold sm:text-3xl">Audit history</h1>
      <Card className="p-4 sm:p-5">
        <form
          onSubmit={search}
          className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1.5fr_1fr_1fr_auto]"
        >
          <label className="grid min-w-0 gap-1 text-sm font-medium">
            Actor, record ID or action
            <input
              className={fieldStyle}
              type="search"
              name="search"
              maxLength={120}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium">
            Category
            <select name="category" className={fieldStyle}>
              <option value="">All categories</option>
              {Object.entries(categories).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium">
            From (Dhaka)
            <input name="from" type="date" className={fieldStyle} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium">
            To (Dhaka)
            <input name="to" type="date" className={fieldStyle} />
          </label>
          <Button className={primaryStyle} type="submit">
            Search
          </Button>
        </form>
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
