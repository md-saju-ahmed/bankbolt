"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import { AccountsPanel } from "./accounts-panel";
import {
  ErrorMessage,
  Field,
  fieldStyle,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "./form-ui";
import {
  useLookupCustomerMutation,
  useRecordVerificationMutation,
  useRegisterCustomerMutation,
  type Customer,
} from "./onboarding-api";

const verificationLabels = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

type EntryMode = "find" | "register";

function CustomerEntry({
  onSelect,
  entryMode,
}: {
  onSelect: (customer: Customer) => void;
  entryMode: EntryMode;
}) {
  const [mode, setMode] = useState(entryMode);
  const [feedback, setFeedback] = useState("");
  const [find, lookup] = useLookupCustomerMutation();
  const [register, creation] = useRegisterCustomerMutation();
  const busy = lookup.isLoading || creation.isLoading;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFeedback("");
    const form = event.currentTarget;
    const fields = new FormData(form);
    const value = (name: string) => String(fields.get(name) ?? "");
    try {
      const result =
        mode === "find"
          ? await find(value("email")).unwrap()
          : await register({
              fullName: value("fullName"),
              email: value("email"),
              phone: value("phone"),
              dateOfBirth: value("dateOfBirth"),
              address: value("address"),
              identityReference: value("identityReference"),
              occupation: value("occupation").trim() || undefined,
              photoUrl: value("photoUrl").trim() || undefined,
              password: value("password"),
            }).unwrap();
      form.reset();
      if (mode === "register") toast.success("Customer registered.");
      onSelect(result.customer);
    } catch (error) {
      setFeedback(
        onboardingError(
          error,
          mode === "find"
            ? "Unable to find the customer."
            : "Unable to register the customer.",
        ),
      );
    }
  }

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div
        className="flex flex-wrap gap-2"
        aria-label="Customer entry options"
        role="group"
      >
        {(["find", "register"] as const).map((option) => (
          <Button
            key={option}
            aria-pressed={mode === option}
            disabled={busy}
            className={mode === option ? primaryStyle : secondaryStyle}
            onClick={() => {
              setMode(option);
              setFeedback("");
            }}
          >
            {option === "find" ? "Find customer" : "Register customer"}
          </Button>
        ))}
      </div>
      <form key={mode} method="post" onSubmit={submit} className="space-y-4">
        {mode === "register" && (
          <p className="text-sm text-muted-foreground">
            Enter fictional details and a temporary password for the simulated
            customer.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "register" && (
            <Field label="Full name" name="fullName" maxLength={120} required />
          )}
          <Field
            label="Email address"
            name="email"
            type="email"
            maxLength={254}
            required
          />
          {mode === "register" && (
            <>
              <Field
                label="Phone number"
                name="phone"
                type="tel"
                maxLength={24}
                required
              />
              <Field
                label="Date of birth"
                name="dateOfBirth"
                type="date"
                required
              />
              <Field label="Address" name="address" maxLength={300} required />
              <Field
                label="Simulated identity reference"
                name="identityReference"
                maxLength={80}
                required
              />
              <Field
                label="Occupation (optional)"
                name="occupation"
                maxLength={100}
              />
              <div className="space-y-1">
                <Field
                  label="Photo URL (optional)"
                  name="photoUrl"
                  type="url"
                  maxLength={2048}
                  pattern="[Hh][Tt][Tt][Pp][Ss]://.+"
                  title="Enter a public HTTPS image URL"
                  placeholder="https://example.com/avatar.jpg"
                  aria-describedby="registration-photo-help"
                />
                <p
                  id="registration-photo-help"
                  className="text-sm text-muted-foreground"
                >
                  Use a public HTTPS image of the fictional customer.
                </p>
              </div>
              <Field
                label="Temporary password"
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </>
          )}
        </div>
        <ErrorMessage message={feedback} />
        <Button type="submit" disabled={busy} className={primaryStyle}>
          {busy
            ? "Working…"
            : mode === "find"
              ? "Open customer"
              : "Save customer"}
        </Button>
      </form>
    </Card>
  );
}

function CustomerReview({
  customer,
  onUpdate,
  onBack,
}: {
  customer: Customer;
  onUpdate: (customer: Customer) => void;
  onBack: () => void;
}) {
  const [record, { isLoading }] = useRecordVerificationMutation();
  const [feedback, setFeedback] = useState("");
  const details = [
    ["Email address", customer.email],
    ["Phone number", customer.phone],
    ["Date of birth", customer.dateOfBirth],
    ["Address", customer.address],
    ["Simulated identity reference", customer.identityReference],
    ["Occupation", customer.occupation],
  ].filter(([, value]) => value);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    const status = new FormData(event.currentTarget).get("status");
    if (status !== "PENDING" && status !== "VERIFIED" && status !== "REJECTED")
      return;
    try {
      const result = await record({ customerId: customer.id, status }).unwrap();
      onUpdate(result.customer);
      toast.success("Verification saved.");
    } catch (error) {
      setFeedback(onboardingError(error, "Unable to record verification."));
    }
  }

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={customer.fullName}
            photoUrl={customer.photoUrl}
            className="size-10"
          />
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold">
              {customer.fullName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {verificationLabels[customer.verificationStatus]}
              {customer.blocked ? " · Access blocked" : ""}
              {!customer.blocked && !customer.accessActive
                ? " · Access inactive"
                : ""}
            </p>
          </div>
        </div>
        <Button className={secondaryStyle} onClick={onBack}>
          Change customer
        </Button>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {details.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <form method="post" onSubmit={submit} className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-full max-w-64 flex-col gap-2 text-sm font-medium">
            Verification decision
            <select
              className={fieldStyle}
              name="status"
              key={customer.verifiedAt}
              defaultValue={customer.verificationStatus}
            >
              {Object.entries(verificationLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className={primaryStyle} disabled={isLoading}>
            {isLoading ? "Saving…" : "Save verification"}
          </Button>
        </div>
        {customer.verifiedAt && (
          <p className="text-sm text-muted-foreground">
            Last reviewed {formatDhakaTimestamp(customer.verifiedAt)} (Dhaka).
          </p>
        )}
        <ErrorMessage message={feedback} />
      </form>
    </Card>
  );
}

export function Onboarding({ entryMode }: { entryMode: EntryMode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Customer onboarding
        </h1>
        <p className="mt-2 text-muted-foreground">
          Register a simulated customer, review their details, and open a bank
          account.
        </p>
      </header>
      {customer ? (
        <>
          <CustomerReview
            key={customer.id}
            customer={customer}
            onUpdate={setCustomer}
            onBack={() => setCustomer(null)}
          />
          <AccountsPanel key={customer.id} customer={customer} />
        </>
      ) : (
        <CustomerEntry onSelect={setCustomer} entryMode={entryMode} />
      )}
    </section>
  );
}
