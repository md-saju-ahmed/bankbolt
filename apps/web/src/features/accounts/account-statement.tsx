"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDocumentDownload } from "@/lib/use-document-download";
import {
  ErrorMessage,
  Field,
  secondaryStyle,
} from "@/features/onboarding/form-ui";

const dhakaDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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
  const { busy, error, status, download, reset, setError } =
    useDocumentDownload("statement");
  const accountSuffix = accountNumber.slice(-4);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    reset();
    if (dates.from > dates.to) {
      setError("End date must be on or after start date.");
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const pdf =
      submitter instanceof HTMLButtonElement && submitter.value === "pdf";
    const datesQuery = new URLSearchParams(dates);
    void download(
      `/api/v1/accounts/${accountId}/statement${pdf ? ".pdf" : ""}?${datesQuery}`,
      `bankbolt-statement-${accountSuffix}-${dates.from}-to-${dates.to}.${pdf ? "pdf" : "csv"}`,
      pdf ? "application/pdf" : "text/csv",
    );
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
      <form className="space-y-3" onSubmit={submit}>
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            className={`min-h-11 aria-disabled:opacity-50 ${secondaryStyle}`}
            aria-disabled={busy}
          >
            Download CSV
          </Button>
          <Button
            type="submit"
            value="pdf"
            className={`min-h-11 aria-disabled:opacity-50 ${secondaryStyle}`}
            aria-disabled={busy}
          >
            Download PDF
          </Button>
        </div>
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
