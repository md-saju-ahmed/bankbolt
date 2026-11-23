import type { ComponentProps } from "react";
import { errorCode } from "@/features/auth/auth-api";

export const fieldStyle =
  "min-h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-primary";
export const primaryStyle =
  "bg-primary text-primary-foreground hover:bg-primary/90";
export const secondaryStyle = "border border-border bg-card hover:bg-muted";

export function Field({
  label,
  className,
  ...input
}: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      <input className={`${fieldStyle} ${className ?? ""}`} {...input} />
    </label>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-danger-ink"
    >
      {message}
    </p>
  );
}

const messages: Record<string, string> = {
  AUTH_REQUIRED: "Your session ended. Sign in again.",
  AUTHENTICATOR_CANCELLED: "Verification was cancelled.",
  AUTHENTICATOR_UNAVAILABLE:
    "Authenticator verification is temporarily unavailable.",
  ACCOUNT_BLOCKED: "Your account is blocked.",
  FORBIDDEN: "Your role cannot perform this action.",
  INVALID_ORIGIN: "Use the configured BankBolt web address.",
  EMAIL_IN_USE:
    "This email is already registered. Use Find customer to reopen the record.",
  IDENTITY_IN_USE: "This identity reference is already registered.",
  VALIDATION_ERROR: "Check the details and try again.",
  PROFILE_ACCESS_RESTRICTED:
    "Restore customer access before changing this profile.",
  PROFILE_UNCHANGED: "Enter at least one changed detail.",
  PROFILE_CHANGE_PENDING: "A profile change is already awaiting review.",
  PROFILE_CHANGE_DECIDED:
    "Another administrator already reviewed this request.",
  PROFILE_SELF_REVIEW: "A different administrator must review this request.",
  NOT_FOUND: "The requested record could not be found.",
  CUSTOMER_NOT_ELIGIBLE: "The customer must be verified with active access.",
  INVALID_CUSTOMER_STATUS:
    "Restore this blocked customer's access before deactivating it.",
  INVALID_TRANSITION:
    "The account status changed. Reopen this record and try again.",
  BUSINESS_ACCOUNT_REQUIRED:
    "Business details can only be edited on Business accounts.",
  INVALID_ACCOUNT_STATUS: "Only pending accounts can be activated here.",
  REQUEST_ID_REUSED:
    "This request already created an account with different details.",
};

export function onboardingError(error: unknown, fallback: string) {
  return messages[errorCode(error) ?? ""] ?? fallback;
}
