"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import { cn } from "@/lib/utils";
import {
  ErrorMessage,
  Field,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import type { History } from "./management-api";

export function Status({
  value,
  labels,
}: {
  value: string;
  labels: Record<string, string>;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        ["ACTIVE", "VERIFIED"].includes(value)
          ? "bg-success-surface text-success-ink"
          : ["BLOCKED", "REJECTED", "FROZEN"].includes(value)
            ? "bg-danger-surface text-danger-ink"
            : "bg-muted text-muted-foreground",
      )}
    >
      {labels[value] ?? value}
    </span>
  );
}

export function Pager({
  page,
  next,
  onPage,
}: {
  page: number;
  next: boolean;
  onPage: (page: number) => void;
}) {
  if (page === 1 && !next) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        className={secondaryStyle}
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span aria-live="polite" className="px-1 text-sm text-muted-foreground">
        Page {page}
      </span>
      <Button
        className={secondaryStyle}
        disabled={!next}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

export function DetailFields({
  fields,
}: {
  fields: [string, string | null][];
}) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium">
            {value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const actions: Record<string, string> = {
  CUSTOMER_ACTIVATED: "Customer access restored",
  CUSTOMER_DEACTIVATED: "Customer access deactivated",
  CUSTOMER_BLOCKED: "Customer blocked",
  ACCOUNT_OPENED: "Account opened",
  ACCOUNT_ACTIVATED: "Account activated",
  ACCOUNT_FROZEN: "Account frozen",
  ACCOUNT_UNFROZEN: "Account unfrozen",
  ACCOUNT_DEACTIVATED: "Account deactivated",
  ACCOUNT_REACTIVATED: "Account reactivated",
  ACCOUNT_METADATA_UPDATED: "Business details updated",
  ACCOUNT_LIMITS_UPDATED: "Transfer limits updated",
};

export function Activity({
  history,
  page,
  onPage,
}: {
  history: History;
  page: number;
  onPage: (page: number) => void;
}) {
  return (
    <section className="space-y-4 border-t pt-5">
      <h3 className="text-base font-semibold">Account and access history</h3>
      {!history.events.length && (
        <p className="text-sm text-muted-foreground">No history recorded.</p>
      )}
      <ul className="space-y-3">
        {history.events.map((event) => (
          <li key={event.id} className="rounded-md border px-4 py-3">
            <p className="text-sm font-semibold">
              {actions[event.action]}
              {event.accountNumber
                ? ` · •••• ${event.accountNumber.slice(-4)}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDhakaTimestamp(event.createdAt)} Dhaka
              {event.actorName ? ` · ${event.actorName}` : ""}
            </p>
            {event.reason && (
              <p className="mt-1 break-words text-sm">{event.reason}</p>
            )}
          </li>
        ))}
      </ul>
      <Pager page={page} next={history.hasNextPage} onPage={onPage} />
    </section>
  );
}

export function ConfirmAction({
  title,
  description,
  dangerous,
  children,
  onConfirm,
}: {
  title: string;
  description: string;
  dangerous?: boolean;
  children?: ReactNode;
  onConfirm: (fields: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const actionStyle = dangerous
    ? "bg-destructive text-white hover:bg-destructive/90"
    : primaryStyle;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await onConfirm(new FormData(event.currentTarget));
      setOpen(false);
      toast.success("Changes saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : onboardingError(error, "Unable to save the change. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          setMessage("");
        }
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button
          className={
            dangerous
              ? "border border-destructive/35 text-danger-ink hover:bg-destructive/5"
              : secondaryStyle
          }
        >
          {title}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim/60" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90svh] w-[calc(100%-2rem)] max-w-md -translate-1/2 overflow-auto rounded-xl border bg-card p-5 shadow-lg sm:p-6">
          <AlertDialog.Title className="text-lg font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 break-words text-sm text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <form method="post" onSubmit={submit} className="mt-5 space-y-4">
            {children}
            <Field
              name="reason"
              label="Reason"
              minLength={3}
              maxLength={300}
              required
            />
            <ErrorMessage message={message} />
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button disabled={busy} className={secondaryStyle}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <Button type="submit" disabled={busy} className={actionStyle}>
                {busy ? "Saving…" : "Confirm change"}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
