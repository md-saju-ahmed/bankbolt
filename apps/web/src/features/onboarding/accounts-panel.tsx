"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  accountStatuses as statuses,
  accountTypes as titles,
  formatTaka,
} from "@/features/accounts/account-display";
import {
  ErrorMessage,
  Field,
  fieldStyle,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "./form-ui";
import {
  useActivateAccountMutation,
  useCreateAccountMutation,
  useOnboardingAccountsQuery,
  type Account,
  type AccountType,
  type Customer,
} from "./onboarding-api";

function Activation({
  customer,
  account,
}: {
  customer: Customer;
  account: Account;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [activate, state] = useActivateAccountMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.isLoading) return;
    setFeedback("");
    try {
      await activate({
        customerId: customer.id,
        accountId: account.id,
      }).unwrap();
      setOpen(false);
      toast.success("Account activated.");
    } catch (error) {
      setFeedback(onboardingError(error, "Unable to activate the account."));
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!state.isLoading) {
          setOpen(next);
          setFeedback("");
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button className={secondaryStyle}>Activate</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim/60" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90svh] w-[calc(100%-2rem)] max-w-md -translate-1/2 overflow-auto rounded-xl border bg-card p-5 shadow-lg sm:p-6">
          <Dialog.Title className="text-lg font-semibold">
            Activate account?
          </Dialog.Title>
          <Dialog.Description className="mt-2 break-words text-sm text-muted-foreground">
            Activate {customer.fullName}&apos;s {titles[account.type]} account
            ending in {account.accountNumber.slice(-4)}.
          </Dialog.Description>
          <form method="post" onSubmit={submit} className="mt-5 space-y-4">
            <ErrorMessage message={feedback} />
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild>
                <Button className={secondaryStyle} disabled={state.isLoading}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                className={primaryStyle}
                disabled={state.isLoading}
              >
                {state.isLoading ? "Activating…" : "Activate account"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AccountCreation({
  customer,
  onCreated,
}: {
  customer: Customer;
  onCreated: () => void;
}) {
  const [type, setType] = useState<AccountType>("SAVINGS");
  const [feedback, setFeedback] = useState("");
  const request = useRef<{ details: string; id: string } | null>(null);
  const [createAccount, state] = useCreateAccountMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.isLoading) return;
    setFeedback("");
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = {
      type,
      businessName:
        String(fields.get("businessName") ?? "").trim() || undefined,
      businessRegistrationReference:
        String(fields.get("businessRegistrationReference") ?? "").trim() ||
        undefined,
    };
    const details = JSON.stringify(body);
    if (request.current?.details !== details)
      request.current = { details, id: crypto.randomUUID() };
    try {
      await createAccount({
        ...body,
        customerId: customer.id,
        requestId: request.current.id,
      }).unwrap();
      request.current = null;
      form.reset();
      setType("SAVINGS");
      onCreated();
      toast.success("Account opened. It is pending activation.");
    } catch (error) {
      setFeedback(
        onboardingError(
          error,
          "Unable to confirm account creation. Retry with the same details.",
        ),
      );
    }
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Account type
          <select
            name="type"
            className={fieldStyle}
            value={type}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === "SAVINGS" ||
                value === "CURRENT" ||
                value === "BUSINESS"
              )
                setType(value);
            }}
          >
            {Object.entries(titles).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {type === "BUSINESS" && (
          <>
            <Field
              label="Business name (optional)"
              name="businessName"
              maxLength={120}
            />
            <Field
              label="Simulated business registration (optional)"
              name="businessRegistrationReference"
              maxLength={80}
            />
          </>
        )}
      </div>
      <ErrorMessage message={feedback} />
      <Button type="submit" className={primaryStyle} disabled={state.isLoading}>
        {state.isLoading ? "Opening…" : "Open account"}
      </Button>
    </form>
  );
}

export function AccountsPanel({ customer }: { customer: Customer }) {
  const [page, setPage] = useState(1);
  const query = useOnboardingAccountsQuery({ customerId: customer.id, page });
  const allowed =
    customer.verificationStatus === "VERIFIED" &&
    !customer.blocked &&
    customer.accessActive;
  const data = query.currentData;

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Bank accounts</h2>
        {!allowed && (
          <p className="mt-1 text-sm text-muted-foreground">
            A customer must be verified with active access to open or activate
            an account.
          </p>
        )}
      </div>
      {allowed && (
        <AccountCreation customer={customer} onCreated={() => setPage(1)} />
      )}
      <div className="space-y-3 border-t pt-4">
        {query.isFetching && (
          <p role="status" className="text-sm text-muted-foreground">
            Checking accounts…
          </p>
        )}
        {query.isError && (
          <div className="space-y-2">
            <ErrorMessage
              message={onboardingError(query.error, "Unable to load accounts.")}
            />
            <Button
              className={secondaryStyle}
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </div>
        )}
        {!query.isError && data && (
          <>
            {data.accounts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No accounts on this page.
              </p>
            )}
            <ul className="space-y-2">
              {data.accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">
                      {titles[account.type]} ••••{" "}
                      {account.accountNumber.slice(-4)}
                    </p>
                    {account.businessName && (
                      <p className="break-words text-sm text-muted-foreground">
                        {account.businessName}
                      </p>
                    )}
                    {account.businessRegistrationReference && (
                      <p className="break-words text-sm text-muted-foreground">
                        Registration {account.businessRegistrationReference}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {statuses[account.status]}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatTaka(account.balancePoisha)}
                    </p>
                    {allowed && account.status === "PENDING" && (
                      <Activation customer={customer} account={account} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {(page > 1 || data.hasNextPage) && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className={secondaryStyle}
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1 || query.isFetching}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page}
                </span>
                <Button
                  className={secondaryStyle}
                  onClick={() => setPage(page + 1)}
                  disabled={!data.hasNextPage || query.isFetching}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
