"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ArrowRight, CircleCheck, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  accountStatuses,
  accountTypes,
  formatTaka,
  parseTakaInput,
} from "@/features/accounts/account-display";
import { errorCode, useWorkspaceQuery } from "@/features/auth/auth-api";
import { useOwnedAccountsQuery } from "@/features/management/management-api";
import { Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  Field,
  fieldStyle,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaFullTimestamp } from "@/lib/dhaka-date";
import { historyLink } from "./transaction-display";
import {
  useChangeTransactionPinMutation,
  useRecoverTransferMutation,
  useSubmitTransferMutation,
  useTransactionPinStatusQuery,
  useTransferQuoteMutation,
  type Quote,
  type Transfer,
  type TransferDraft,
} from "./transfer-api";

const errors: Record<string, string> = {
  INVALID_CREDENTIALS: "The sign-in password is incorrect.",
  INVALID_PIN: "The transaction PIN is incorrect.",
  PIN_CHANGED:
    "The transaction PIN changed. Enter your current PIN and try again.",
  TOO_MANY_ATTEMPTS: "Too many PIN attempts. Try again in 15 minutes.",
  SOURCE_NOT_FOUND: "Select one of your available source accounts.",
  RECIPIENT_NOT_FOUND: "Check the recipient account number.",
  SAME_ACCOUNT: "Choose a recipient different from the source account.",
  ACCOUNT_RESTRICTED: "The source or recipient account is restricted.",
  INSUFFICIENT_FUNDS: "The source account cannot cover the amount and fee.",
  TRANSFER_LIMIT_EXCEEDED:
    "The amount exceeds this account's per-transfer limit.",
  DAILY_TRANSFER_LIMIT_EXCEEDED:
    "The amount exceeds this account's remaining daily transfer limit.",
  RECIPIENT_BALANCE_LIMIT: "The recipient account cannot accept this amount.",
};

function transferError(error: unknown, fallback: string) {
  return errors[errorCode(error) ?? ""] ?? onboardingError(error, fallback);
}

type PendingTransfer = { key: string; fingerprint: string };
type Review = {
  draft: TransferDraft;
  quote: Quote;
  fingerprint: string;
  pin: string;
};

function readPending(storageKey: string): PendingTransfer | null {
  try {
    const value = window.sessionStorage.getItem(storageKey);
    if (!value) return null;
    const stored = JSON.parse(value);
    if (
      typeof stored.key === "string" &&
      typeof stored.fingerprint === "string"
    )
      return stored;
  } catch {
    // The in-memory key still protects retries when browser storage is unavailable.
  }
  return null;
}

async function fingerprintDraft(draft: TransferDraft) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(draft)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function PinSettings({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(!configured);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [save, { isLoading }] = useChangeTransactionPinMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    setFeedback("");
    try {
      await save({
        password: String(data.get("password") ?? ""),
        newPin: String(data.get("newPin") ?? ""),
        ...(configured
          ? { currentPin: String(data.get("currentPin") ?? "") }
          : {}),
      }).unwrap();
      form.reset();
      setOpen(false);
      setFeedback("Transaction PIN saved.");
    } catch (failure) {
      setError(transferError(failure, "Could not save the PIN. Try again."));
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <LockKeyhole
          aria-hidden
          size={20}
          className="mt-0.5 shrink-0 text-primary"
        />
        <div>
          <h2 className="text-base font-semibold">Transaction PIN</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {configured
              ? "Your six-digit PIN confirms transfers."
              : "Set a six-digit PIN before sending money."}
          </p>
        </div>
      </div>
      {open ? (
        <form method="post" onSubmit={submit} className="space-y-3">
          <Field
            type="password"
            name="password"
            label="Sign-in password"
            maxLength={128}
            autoComplete="current-password"
            required
          />
          {configured && (
            <Field
              type="password"
              name="currentPin"
              label="Current PIN"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          )}
          <Field
            type="password"
            name="newPin"
            label="New PIN"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
          <ErrorMessage message={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className={primaryStyle} disabled={isLoading}>
              {isLoading ? "Saving…" : "Save PIN"}
            </Button>
            {configured && (
              <Button
                className={secondaryStyle}
                disabled={isLoading}
                onClick={() => {
                  setOpen(false);
                  setError("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <Button className={secondaryStyle} onClick={() => setOpen(true)}>
          Change PIN
        </Button>
      )}
      {feedback && (
        <p role="status" className="text-sm text-emerald-800">
          {feedback}
        </p>
      )}
    </Card>
  );
}

function ReviewFields({ quote }: { quote: Quote }) {
  return (
    <dl className="divide-y text-sm">
      {[
        ["Source account", quote.sourceAccountNumber],
        ["Recipient account", quote.recipientAccountNumber],
        ["Transfer amount", formatTaka(quote.amountPoisha)],
        ["Transfer fee", formatTaka(quote.feePoisha)],
        ["Total debit", formatTaka(quote.totalDebitPoisha)],
      ].map(([label, value]) => (
        <div
          className="flex flex-wrap justify-between gap-1 py-2.5"
          key={label}
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-all font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TransferSuccess({
  transfer,
  startAgain,
}: {
  transfer: Transfer;
  startAgain: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const path = `/customer/transactions/${transfer.reference}`;
  return (
    <Card className="max-w-2xl space-y-5 p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <CircleCheck
          aria-hidden
          className="mt-0.5 text-emerald-700"
          size={24}
        />
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            Transfer completed
          </h2>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            Reference {transfer.reference}
          </p>
        </div>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-semibold tabular-nums">
            {formatTaka(transfer.amountPoisha)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fee</dt>
          <dd className="font-semibold tabular-nums">
            {formatTaka(transfer.feePoisha)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Recipient account</dt>
          <dd className="font-semibold">{transfer.recipientAccountNumber}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Date and time</dt>
          <dd className="font-semibold">
            {formatDhakaFullTimestamp(transfer.createdAt)}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link className={`${historyLink} ${primaryStyle}`} href={path}>
          View transaction
        </Link>
        <Link
          className={`${historyLink} ${secondaryStyle}`}
          href={`${path}/receipt`}
        >
          Print receipt
        </Link>
        <Button className={secondaryStyle} onClick={startAgain}>
          New transfer
        </Button>
      </div>
    </Card>
  );
}

function TransferForm({ userId }: { userId: string }) {
  const storageKey = `bankbolt.pending-transfer.${userId}`;
  const [pending, setPending] = useState(() => readPending(storageKey));
  const [checked, setChecked] = useState(false);
  const [page, setPage] = useState(1);
  const [sourceId, setSourceId] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [result, setResult] = useState<Transfer | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const accounts = useOwnedAccountsQuery(page, {
    refetchOnMountOrArgChange: true,
  });
  const pinStatus = useTransactionPinStatusQuery();
  const [getQuote, { isLoading: quoting }] = useTransferQuoteMutation();
  const [send, { isLoading: sending }] = useSubmitTransferMutation();
  const [recover, { isLoading: recovering }] = useRecoverTransferMutation();
  const rows = accounts.currentData?.accounts ?? [];
  const source = rows.find((account) => account.id === sourceId);
  const busy = quoting || sending || recovering;

  function remember(next: PendingTransfer | null) {
    setPending(next);
    try {
      if (next) window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      else window.sessionStorage.removeItem(storageKey);
    } catch {
      // Retain the in-memory key for this visit.
    }
  }

  function completed(transfer: Transfer) {
    remember(null);
    setChecked(false);
    setReview(null);
    setResult(transfer);
    setNotice("");
    setError("");
  }

  async function checkStatus() {
    if (!pending || lock.current) return;
    lock.current = true;
    setError("");
    setNotice("");
    try {
      const { transfer } = await recover(pending.key).unwrap();
      completed(transfer);
    } catch (failure) {
      if (errorCode(failure) === "TRANSFER_NOT_FOUND") {
        setChecked(true);
        setNotice(
          "No receipt is visible yet. You can check again or retry using the exact same transfer details.",
        );
      } else {
        setError(
          transferError(
            failure,
            "Could not check the transfer. Try checking again.",
          ),
        );
      }
    } finally {
      lock.current = false;
    }
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || (pending && !checked)) return;
    lock.current = true;
    const data = new FormData(event.currentTarget);
    setError("");
    try {
      if (!source || source.restriction)
        throw new Error("Choose an active source account.");
      const description = String(data.get("description") ?? "").trim();
      if (!description) throw new Error("Enter a transfer description.");
      const draft = {
        sourceAccountId: source.id,
        recipientAccountNumber: String(data.get("recipient") ?? "").trim(),
        amountPoisha: parseTakaInput(String(data.get("amount") ?? "")),
        description,
      };
      const pin = String(data.get("pin") ?? "");
      if (draft.amountPoisha === "0")
        throw new Error("Enter an amount greater than zero.");
      const fingerprint = await fingerprintDraft(draft);
      if (pending && pending.fingerprint !== fingerprint)
        throw new Error(
          "Use the same source, recipient, amount, and description as the pending transfer.",
        );
      const { quote } = await getQuote({
        sourceAccountId: draft.sourceAccountId,
        recipientAccountNumber: draft.recipientAccountNumber,
        amountPoisha: draft.amountPoisha,
      }).unwrap();
      setReview({ draft, quote, fingerprint, pin });
    } catch (failure) {
      setError(
        transferError(
          failure,
          failure instanceof Error
            ? failure.message
            : "Could not verify the transfer details.",
        ),
      );
    } finally {
      lock.current = false;
    }
  }

  async function confirm() {
    if (!review || lock.current) return;
    lock.current = true;
    const attempt = pending ?? {
      key: crypto.randomUUID(),
      fingerprint: review.fingerprint,
    };
    remember(attempt);
    setError("");
    setNotice("");
    const pinInput = form.current?.elements.namedItem("pin");
    if (pinInput instanceof HTMLInputElement) pinInput.value = "";
    try {
      const { transfer } = await send({
        ...review.draft,
        pin: review.pin,
        idempotencyKey: attempt.key,
      }).unwrap();
      completed(transfer);
    } catch (failure) {
      setReview(null);
      const code = errorCode(failure);
      const status =
        typeof failure === "object" && failure && "status" in failure
          ? failure.status
          : null;
      if (
        pending ||
        code === "IDEMPOTENCY_CONFLICT" ||
        typeof status !== "number" ||
        status >= 500
      ) {
        setChecked(false);
        setNotice(
          "The transfer outcome is unconfirmed. Check its status before sending again.",
        );
      } else {
        remember(null);
        setError(
          transferError(
            failure,
            "The transfer was declined. Check the details and try again.",
          ),
        );
      }
    } finally {
      lock.current = false;
    }
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Transfer funds
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Send BDT between your accounts or to another BankBolt customer.
        </p>
      </header>
      {result ? (
        <TransferSuccess
          transfer={result}
          startAgain={() => {
            setSourceId("");
            setResult(null);
          }}
        />
      ) : (
        <>
          {pending && (
            <Card className="space-y-2 border-amber-200 bg-amber-50 p-4 text-amber-950">
              <h2 className="text-sm font-semibold">
                Check the previous transfer
              </h2>
              <p role="status" className="text-sm">
                {notice || "Check the transfer status before trying again."}
              </p>
              <Button
                className={secondaryStyle}
                onClick={() => void checkStatus()}
                disabled={busy}
              >
                {recovering ? "Checking…" : "Check transfer status"}
              </Button>
            </Card>
          )}
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
            <Card className="space-y-4 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Transfer details</h2>
              {accounts.isLoading && (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading your accounts…
                </p>
              )}
              {accounts.isError && (
                <div className="space-y-2">
                  <ErrorMessage message="Could not load your accounts." />
                  <Button
                    className={secondaryStyle}
                    onClick={() => void accounts.refetch()}
                  >
                    Try again
                  </Button>
                </div>
              )}
              {accounts.currentData && rows.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  There are no accounts on this page.
                </p>
              )}
              <form
                ref={form}
                method="post"
                onSubmit={prepare}
                className="space-y-4"
              >
                <fieldset
                  disabled={busy || Boolean(pending && !checked)}
                  className="min-w-0 space-y-4"
                >
                  <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
                    Source account
                    <select
                      className={fieldStyle}
                      required
                      value={sourceId}
                      onChange={(event) => setSourceId(event.target.value)}
                    >
                      <option value="">Select an account</option>
                      {rows.map((account) => (
                        <option
                          key={account.id}
                          value={account.id}
                          disabled={Boolean(account.restriction)}
                        >
                          {accountTypes[account.type]} · {account.accountNumber}
                          {account.restriction
                            ? ` · ${accountStatuses[account.status]}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {accounts.currentData && (
                    <Pager
                      page={page}
                      next={accounts.currentData.hasNextPage}
                      onPage={(next) => {
                        setSourceId("");
                        setPage(next);
                      }}
                    />
                  )}
                  {source && (
                    <dl className="grid gap-3 rounded-md bg-muted p-3 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">
                          Available balance
                        </dt>
                        <dd className="break-words font-semibold tabular-nums">
                          {formatTaka(source.balancePoisha)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Per transfer</dt>
                        <dd className="break-words font-semibold tabular-nums">
                          {formatTaka(source.transferLimitPoisha)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Daily limit</dt>
                        <dd className="break-words font-semibold tabular-nums">
                          {formatTaka(source.dailyTransferLimitPoisha)}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      name="recipient"
                      label="Recipient account number"
                      inputMode="numeric"
                      pattern="[0-9]{12}"
                      maxLength={12}
                      autoComplete="off"
                      required
                    />
                    <Field
                      name="amount"
                      label="Amount (BDT)"
                      inputMode="decimal"
                      maxLength={20}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <Field
                    name="description"
                    label="Description"
                    maxLength={300}
                    required
                  />
                  <Field
                    name="pin"
                    label="Transaction PIN"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </fieldset>
                <ErrorMessage message={error} />
                <Button
                  ref={reviewButton}
                  type="submit"
                  className={primaryStyle}
                  disabled={
                    !source ||
                    Boolean(source.restriction) ||
                    busy ||
                    !pinStatus.currentData?.configured ||
                    Boolean(pending && !checked)
                  }
                >
                  {quoting ? "Checking details…" : "Review transfer"}{" "}
                  <ArrowRight aria-hidden size={16} />
                </Button>
              </form>
            </Card>
            {pinStatus.currentData ? (
              <PinSettings configured={pinStatus.currentData.configured} />
            ) : (
              <Card className="space-y-2 p-5">
                {pinStatus.isError ? (
                  <>
                    <ErrorMessage message="Could not check your PIN settings." />
                    <Button
                      className={secondaryStyle}
                      onClick={() => void pinStatus.refetch()}
                    >
                      Try again
                    </Button>
                  </>
                ) : (
                  <p role="status" className="text-sm text-muted-foreground">
                    Checking PIN settings…
                  </p>
                )}
              </Card>
            )}
          </div>
        </>
      )}
      <AlertDialog.Root
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !lock.current) setReview(null);
        }}
      >
        {review && (
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-40 bg-navy/60" />
            <AlertDialog.Content
              onEscapeKeyDown={(event) => {
                if (sending) event.preventDefault();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                reviewButton.current?.focus();
              }}
              className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-1/2 overflow-y-auto rounded-xl border bg-card p-5 shadow-xl sm:p-6"
            >
              <AlertDialog.Title className="text-xl font-semibold">
                Review transfer
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-1 mb-4 text-sm text-muted-foreground">
                Check the recipient and total debit before confirming.
              </AlertDialog.Description>
              <ReviewFields quote={review.quote} />
              <p className="mt-3 break-words text-sm">
                <span className="text-muted-foreground">Description </span>
                {review.draft.description}
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <AlertDialog.Cancel asChild>
                  <Button className={secondaryStyle} disabled={sending}>
                    Back to edit
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  className={primaryStyle}
                  disabled={sending}
                  onClick={() => void confirm()}
                >
                  {sending ? "Sending…" : "Confirm transfer"}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        )}
      </AlertDialog.Root>
    </section>
  );
}

export function TransferPageContent() {
  const session = useWorkspaceQuery("CUSTOMER");
  const user = session.currentData?.user;
  return user && <TransferForm key={user.id} userId={user.id} />;
}
