"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { formatTaka } from "@/features/accounts/account-display";
import { errorCode } from "@/features/auth/auth-api";
import {
  ErrorMessage,
  fieldStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import {
  useReverseTransferMutation,
  type Transaction,
} from "./transactions-api";

const errors: Record<string, string> = {
  ACCOUNT_RESTRICTED:
    "Both accounts must be active and their holders must have access.",
  ACCOUNT_BALANCE_LIMIT: "The original sender cannot accept the refund.",
  INSUFFICIENT_FUNDS:
    "The original recipient does not have enough available funds.",
  TRANSFER_NOT_REVERSIBLE: "This transfer is no longer eligible for reversal.",
};

export function TransferReversal({
  transaction,
}: {
  transaction: Transaction;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [reverse, { isLoading }] = useReverseTransferMutation();
  const refund =
    BigInt(transaction.amountPoisha) + BigInt(transaction.feePoisha);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading || !reason.trim()) return;
    setError("");
    try {
      await reverse({
        reference: transaction.reference,
        reason: reason.trim(),
      }).unwrap();
      setOpen(false);
      setReason("");
    } catch (failure) {
      setError(
        errors[errorCode(failure) ?? ""] ??
          "The reversal could not be confirmed. Check transaction details before retrying.",
      );
    }
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (isLoading) return;
        setOpen(next);
        if (next) setError("");
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button className={secondaryStyle}>Reverse transfer</Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim/60" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border bg-card p-5 shadow-lg">
          <AlertDialog.Title className="text-lg font-semibold">
            Reverse this transfer?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            Debit {formatTaka(transaction.amountPoisha)} from the original
            recipient and credit {formatTaka(refund.toString())} to the original
            sender, including the original fee.
          </AlertDialog.Description>
          <form
            onSubmit={(event) => void confirm(event)}
            className="mt-4 space-y-4"
          >
            <label className="grid gap-1 text-sm font-medium">
              Reason
              <textarea
                placeholder="Explain why this transfer should be reversed"
                className={fieldStyle}
                required
                maxLength={300}
                rows={3}
                value={reason}
                disabled={isLoading}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {error && <ErrorMessage message={error} />}
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button
                  type="button"
                  className={secondaryStyle}
                  disabled={isLoading}
                >
                  Keep transfer
                </Button>
              </AlertDialog.Cancel>
              <Button
                type="submit"
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isLoading || !reason.trim()}
              >
                {isLoading ? "Reversing…" : "Confirm reversal"}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
