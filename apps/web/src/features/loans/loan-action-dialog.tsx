"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorCode } from "@/features/auth/auth-api";
import {
  ErrorMessage,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";

const actionErrors: Record<string, string> = {
  ACCOUNT_BALANCE_LIMIT: "The account cannot accept this disbursement.",
  ACCOUNT_RESTRICTED:
    "This account is restricted. Check its status or select another eligible account for repayment.",
  INSUFFICIENT_FUNDS: "The selected account cannot cover this installment.",
  INSTALLMENT_ALREADY_PAID:
    "This installment has already been paid. Check the repayment history.",
  INSTALLMENT_OUT_OF_ORDER: "Pay the oldest unpaid installment first.",
  INSTALLMENT_AMOUNT_CHANGED:
    "The amount has changed. Review the updated payment total before confirming.",
  INSTALLMENT_NOT_DUE: "This installment is not due yet.",
  INVALID_PIN: "The transaction PIN is incorrect.",
  PIN_CHANGED: "The transaction PIN changed. Enter the current PIN.",
  TOO_MANY_ATTEMPTS: "Too many PIN attempts. Try again in 15 minutes.",
  LOAN_NOT_FORWARDED:
    "This application is no longer awaiting an Admin decision.",
  LOAN_NOT_APPROVED: "This loan must be approved before disbursement.",
  LOAN_APPLICANT_UNVERIFIED:
    "Ask Bank Staff to verify the applicant before proceeding.",
  LOAN_APPLICANT_UNDERAGE: "The applicant must be at least 18 years old.",
  LOAN_AFFORDABILITY_LIMIT:
    "The requested loan and active loans exceed 40% of declared monthly income.",
  LOAN_ALREADY_SETTLED:
    "The loan was already settled. Open its settlement receipt.",
  SETTLEMENT_AMOUNT_CHANGED:
    "The settlement amount changed. Review the latest total before confirming.",
  LOAN_NOT_ACTIVE: "This loan must be active before a payment can be made.",
  SELF_REVIEW: "You cannot decide or disburse your own loan.",
};

export function LoanActionDialog({
  label,
  title,
  description,
  confirmLabel,
  secondary,
  disabled,
  fields,
  onConfirm,
  onSuccessFocus,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  secondary?: boolean;
  disabled?: boolean;
  fields?: ReactNode;
  onConfirm: (data: FormData) => Promise<string>;
  onSuccessFocus?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const succeeded = useRef(false);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const form = event.currentTarget;
    const input = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const message = await onConfirm(input);
      toast.success(message);
      succeeded.current = true;
      setOpen(false);
    } catch (failure) {
      const pin = form.elements.namedItem("pin");
      if (pin instanceof HTMLInputElement) pin.value = "";
      setError(
        actionErrors[errorCode(failure) ?? ""] ??
          onboardingError(
            failure,
            "Could not confirm the outcome. Check the loan status before trying again.",
          ),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!inFlight.current) {
          succeeded.current = false;
          setError("");
          setOpen(value);
        }
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button
          className={secondary ? secondaryStyle : primaryStyle}
          disabled={disabled}
        >
          {label}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim/60" />
        <AlertDialog.Content
          className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-1/2 space-y-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-lg"
          onEscapeKeyDown={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest(
                '[data-slot="combobox-popup"], [data-slot="combobox-trigger"][aria-expanded="true"]',
              )
            )
              event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            if (succeeded.current && onSuccessFocus) {
              event.preventDefault();
              onSuccessFocus();
            }
          }}
        >
          <AlertDialog.Title className="text-lg font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <form onSubmit={(event) => void confirm(event)} className="space-y-4">
            {fields}
            <ErrorMessage message={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button className={secondaryStyle} disabled={busy}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <Button type="submit" className={primaryStyle} disabled={busy}>
                {busy ? "Saving…" : confirmLabel}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
