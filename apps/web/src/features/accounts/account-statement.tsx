"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { errorCode } from "@/features/auth/auth-api";
import {
  ErrorMessage,
  Field,
  onboardingError,
  secondaryStyle,
} from "@/features/onboarding/form-ui";

const dhakaDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const downloadError = "Unable to download this statement. Try again.";

export function AccountStatement({
  accountId,
  accountNumber,
}: {
  accountId: string;
  accountNumber: string;
}) {
  const [dates, setDates] = useState(() => {
    const to = dhakaDate.format(new Date());
    return { from: `${to.slice(0, 7)}-01`, to };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  const accountSuffix = accountNumber.slice(-4);

  useEffect(() => () => request.current?.abort(), []);

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    setError("");
    setStatus("");
    if (dates.from > dates.to) {
      setError("End date must be on or after start date.");
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const query = new URLSearchParams(dates);
      const response = await fetch(
        `/api/v1/accounts/${accountId}/statement?${query}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => undefined);
        if (!controller.signal.aborted) {
          setError(
            errorCode({ data }) === "STATEMENT_TOO_LARGE"
              ? "This statement is too large. Choose a shorter date range."
              : onboardingError({ data }, downloadError),
          );
        }
        return;
      }
      if (!response.headers.get("content-type")?.startsWith("text/csv")) {
        setError(downloadError);
        return;
      }

      const csv = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(csv);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bankbolt-statement-${accountSuffix}-${dates.from}-to-${dates.to}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Statement download started.");
    } catch {
      if (!controller.signal.aborted) setError(downloadError);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Account statement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download completed transactions for account ending in {accountSuffix}.
          The date range uses Dhaka time and includes both dates.
        </p>
      </div>
      <form className="space-y-3" onSubmit={download}>
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <Field
            label="Start date"
            type="date"
            required
            disabled={busy}
            value={dates.from}
            onChange={(event) =>
              setDates({ ...dates, from: event.target.value })
            }
          />
          <Field
            label="End date"
            type="date"
            required
            disabled={busy}
            value={dates.to}
            onChange={(event) => setDates({ ...dates, to: event.target.value })}
          />
        </div>
        <Button
          type="submit"
          className={`min-h-11 aria-disabled:opacity-50 ${secondaryStyle}`}
          aria-disabled={busy}
        >
          {busy ? "Preparing statement…" : "Download CSV"}
        </Button>
        <ErrorMessage message={error} />
        <p
          className="text-sm text-muted-foreground empty:sr-only"
          role="status"
        >
          {busy ? "Preparing your statement." : status}
        </p>
      </form>
    </Card>
  );
}
