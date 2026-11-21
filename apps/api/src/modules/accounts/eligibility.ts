import type { bankAccounts } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";

type Status = typeof bankAccounts.$inferSelect.status;

const restrictions = {
  PENDING: "This account is pending activation.",
  FROZEN: "This account is frozen. It cannot send or receive funds.",
  DEACTIVATED: "This account is deactivated. It cannot send or receive funds.",
};

export function financialRestriction(status: Status) {
  return status === "ACTIVE" ? null : restrictions[status];
}

export function assertFinancialAccountEligible(account: {
  status: Status;
  blocked: boolean;
  accessActive: boolean;
}) {
  const restriction = financialRestriction(account.status);
  if (restriction || account.blocked || !account.accessActive) {
    throw new ApiError(
      409,
      "ACCOUNT_RESTRICTED",
      restriction ?? "The account holder's access is restricted.",
    );
  }
}
