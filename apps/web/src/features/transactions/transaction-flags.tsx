"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Flag as FlagIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/skeleton";
import { formatTaka } from "@/features/accounts/account-display";
import { errorCode } from "@/features/auth/auth-api";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  fieldStyle,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import { historyLink } from "./transaction-display";
import { transactionTypes } from "./transactions-api";
import {
  useFlagQueueQuery,
  useFlagTransactionMutation,
  useRelatedFlagsQuery,
  useResolveTransactionFlagMutation,
  type Flag,
  type FlagStatus,
} from "./transaction-flags-api";

function FlagDialog({
  action,
  submit,
  fallbackFocus,
}: {
  action: "flag" | "resolve";
  submit: (note: string) => Promise<unknown>;
  fallbackFocus: () => void;
}) {
  const flagging = action === "flag";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const note = String(
      new FormData(event.currentTarget).get("note") ?? "",
    ).trim();
    if (flagging && !note) {
      setError("Enter a reason for the flag.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await submit(note);
      setOpen(false);
    } catch (failure) {
      const code = errorCode(failure);
      const status =
        typeof failure === "object" && failure !== null && "status" in failure
          ? failure.status
          : null;
      if (code === "FLAG_ALREADY_OPEN")
        setError("This transaction already has an open flag.");
      else if (code === "FLAG_ALREADY_RESOLVED")
        setError("This flag has already been resolved.");
      else if (typeof status !== "number" || status >= 500) {
        setError(
          "Could not confirm the outcome. Check flag history before trying again.",
        );
      } else
        setError(onboardingError(failure, "Could not save this flag action."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!lock.current) {
          setOpen(next);
          setError("");
        }
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button
          className={flagging ? secondaryStyle : primaryStyle}
          ref={trigger}
        >
          {flagging && <FlagIcon aria-hidden size={16} />}
          {flagging ? "Flag transaction" : "Resolve flag"}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim/60" />
        <AlertDialog.Content
          onEscapeKeyDown={(event) => {
            if (lock.current) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() =>
              trigger.current ? trigger.current.focus() : fallbackFocus(),
            );
          }}
          className="fixed top-1/2 left-1/2 z-50 max-h-[90svh] w-[calc(100%-2rem)] max-w-md -translate-1/2 overflow-auto rounded-xl border bg-card p-5 shadow-lg sm:p-6"
        >
          <AlertDialog.Title className="text-lg font-semibold">
            {flagging ? "Flag this transaction" : "Resolve this flag"}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            {flagging
              ? "Send this transaction to Admin for review."
              : "Record the outcome of your review."}
          </AlertDialog.Description>
          <form method="post" onSubmit={confirm} className="mt-4 space-y-4">
            <label className="flex flex-col gap-2 text-sm font-medium">
              {flagging ? "Reason for flag" : "Resolution note (optional)"}
              <textarea
                name="note"
                rows={3}
                required={flagging}
                maxLength={300}
                disabled={busy}
                className={`${fieldStyle} py-2`}
                onChange={() => setError("")}
              />
            </label>
            <ErrorMessage message={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button className={secondaryStyle} disabled={busy}>
                  Back
                </Button>
              </AlertDialog.Cancel>
              <Button type="submit" className={primaryStyle} disabled={busy}>
                {busy
                  ? "Saving…"
                  : flagging
                    ? "Submit flag"
                    : "Confirm resolution"}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function FlagEntry({
  flag,
  action,
  showTransaction = false,
}: {
  flag: Flag;
  action?: ReactNode;
  showTransaction?: boolean;
}) {
  return (
    <li className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {showTransaction && (
            <>
              <p className="font-semibold">
                {transactionTypes[flag.type]}{" "}
                <span className="tabular-nums">
                  {formatTaka(flag.amountPoisha)}
                </span>
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {flag.reference}
              </p>
            </>
          )}
          <p
            className={`${showTransaction ? "mt-3" : ""} break-words text-sm font-medium`}
          >
            {flag.reason}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${flag.status === "OPEN" ? "bg-warning-surface text-warning-ink" : "bg-muted text-muted-foreground"}`}
        >
          {flag.status === "OPEN" ? "Open" : "Resolved"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Flagged by {flag.reporterName} ·{" "}
        <time dateTime={flag.createdAt}>
          {formatDhakaTimestamp(flag.createdAt)}
        </time>
      </p>
      {flag.resolvedAt && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Resolved by {flag.resolverName} ·{" "}
            <time dateTime={flag.resolvedAt}>
              {formatDhakaTimestamp(flag.resolvedAt)}
            </time>
          </p>
          {flag.resolutionNote && (
            <p className="break-words text-sm">{flag.resolutionNote}</p>
          )}
        </div>
      )}
      {action}
    </li>
  );
}

export function TransactionFlagsPanel({
  reference,
  role,
}: {
  reference: string;
  role: "STAFF" | "ADMIN";
}) {
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useRelatedFlagsQuery(
    { reference, page },
    { refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );
  const [flagTransaction] = useFlagTransactionMutation();
  const [resolveFlag] = useResolveTransactionFlagMutation();
  const rows = query.currentData?.flags ?? [];
  const focusHeading = () => heading.current?.focus();

  async function createFlag(reason: string) {
    await flagTransaction({ reference, reason }).unwrap();
    setFeedback("Flag sent to Admin for review.");
    setPage(1);
  }
  async function resolve(id: string, note: string) {
    await resolveFlag({ id, note }).unwrap();
    setFeedback("Flag resolved.");
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          Transaction flags
        </h2>
        {role === "STAFF" &&
          page === 1 &&
          query.currentData &&
          !query.isError &&
          !rows.some((flag) => flag.status === "OPEN") && (
            <FlagDialog
              action="flag"
              submit={createFlag}
              fallbackFocus={focusHeading}
            />
          )}
      </div>
      {feedback && (
        <p role="status" className="px-4 pt-3 text-sm text-muted-foreground">
          {feedback}
        </p>
      )}
      {query.isFetching && !query.isError && !query.currentData && (
        <ListSkeleton label="Loading flags" />
      )}
      {query.isError ? (
        <div className="space-y-2 p-4">
          <ErrorMessage message="Could not load transaction flags." />
          <Button
            className={secondaryStyle}
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        query.currentData && (
          <>
            {rows.length ? (
              <ul className="divide-y">
                {rows.map((flag) => (
                  <FlagEntry
                    key={flag.id}
                    flag={flag}
                    action={
                      role === "ADMIN" && flag.status === "OPEN" ? (
                        <FlagDialog
                          action="resolve"
                          submit={(note) => resolve(flag.id, note)}
                          fallbackFocus={focusHeading}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                {role === "STAFF"
                  ? "You have not flagged this transaction."
                  : "No flags for this transaction."}
              </p>
            )}
            {(page > 1 || query.currentData.hasNextPage) && (
              <div className="border-t p-4">
                <Pager
                  page={page}
                  next={query.currentData.hasNextPage}
                  onPage={setPage}
                />
              </div>
            )}
          </>
        )
      )}
    </Card>
  );
}

export function TransactionFlagsQueue({
  workspace,
}: {
  workspace: "admin" | "staff";
}) {
  const [status, setStatus] = useState<FlagStatus | "">("OPEN");
  const [page, setPage] = useState(1);
  const query = useFlagQueueQuery(
    { workspace, page, status: status || undefined },
    { refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );
  const rows = query.currentData?.flags ?? [];
  return (
    <section className="max-w-4xl space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {workspace === "admin" ? "Transaction flags" : "My transaction flags"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {workspace === "admin"
            ? "Review transactions flagged by Staff or automated rules."
            : "Track the flags you sent for Admin review."}
        </p>
      </header>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <h2 className="text-lg font-semibold">
            {workspace === "admin" ? "Flag review queue" : "Submitted flags"}
          </h2>
          <label className="flex min-w-36 flex-col gap-1 text-sm font-medium">
            Status
            <select
              className={fieldStyle}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as FlagStatus | "");
                setPage(1);
              }}
            >
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
              <option value="">All statuses</option>
            </select>
          </label>
        </div>
        {query.isFetching && !query.isError && !query.currentData && (
          <ListSkeleton label="Loading flags" />
        )}
        {query.isError ? (
          <div className="space-y-2 p-4">
            <ErrorMessage message="Could not load the flag review queue." />
            <Button
              className={secondaryStyle}
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          query.currentData && (
            <>
              {rows.length ? (
                <ul className="divide-y">
                  {rows.map((flag) => (
                    <FlagEntry
                      key={flag.id}
                      flag={flag}
                      showTransaction
                      action={
                        <Link
                          href={`/${workspace}/transactions/${flag.reference}#transaction-flags`}
                          className={`${historyLink} ${secondaryStyle}`}
                        >
                          {workspace === "admin" && flag.status === "OPEN"
                            ? "Review transaction"
                            : "View transaction"}
                        </Link>
                      }
                    />
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  No flags match this status.
                </p>
              )}
              {(page > 1 || query.currentData.hasNextPage) && (
                <div className="border-t p-4">
                  <Pager
                    page={page}
                    next={query.currentData.hasNextPage}
                    onPage={setPage}
                  />
                </div>
              )}
            </>
          )
        )}
      </Card>
    </section>
  );
}
