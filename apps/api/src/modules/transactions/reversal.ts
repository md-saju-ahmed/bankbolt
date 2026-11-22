import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  customerProfiles,
  transactions,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { maxPoisha } from "../../lib/money.ts";
import { assertFinancialAccountEligible } from "../accounts/eligibility.ts";

export const reversalInput = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((reason) => !reason.includes("\0")),
});

export function reverseTransfer(
  adminId: string,
  reference: string,
  reason: string,
) {
  return getDatabase().transaction(async (tx) => {
    const [admin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, adminId),
          eq(users.role, "ADMIN"),
          eq(users.accessActive, true),
          eq(users.blocked, false),
        ),
      )
      .for("share");
    if (!admin)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "An active Admin must reverse the transfer.",
      );

    const [transfer] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.reference, reference))
      .for("no key update");
    if (!transfer)
      throw new ApiError(404, "NOT_FOUND", "Transaction not found.");
    if (
      transfer.type !== "FUND_TRANSFER" ||
      transfer.status !== "COMPLETED" ||
      !transfer.senderAccountId ||
      !transfer.receiverAccountId
    ) {
      throw new ApiError(
        409,
        "TRANSFER_NOT_REVERSIBLE",
        "Only a completed transfer can be reversed once.",
      );
    }

    const accountIds = [transfer.senderAccountId, transfer.receiverAccountId];
    const ownerIds = tx
      .select({ id: bankAccounts.customerId })
      .from(bankAccounts)
      .where(inArray(bankAccounts.id, accountIds));
    // Match the lock order used by transfers: owners first, then accounts in ID order.
    const owners = await tx
      .select({
        id: customerProfiles.id,
        blocked: users.blocked,
        accessActive: users.accessActive,
      })
      .from(customerProfiles)
      .innerJoin(users, eq(users.id, customerProfiles.userId))
      .where(
        and(inArray(customerProfiles.id, ownerIds), eq(users.role, "CUSTOMER")),
      )
      .orderBy(asc(customerProfiles.id))
      .for("share", { of: [customerProfiles, users] });
    const accounts = await tx
      .select()
      .from(bankAccounts)
      .where(inArray(bankAccounts.id, accountIds))
      .orderBy(asc(bankAccounts.id))
      .for("no key update");
    const source = accounts.find(
      (account) => account.id === transfer.senderAccountId,
    );
    const recipient = accounts.find(
      (account) => account.id === transfer.receiverAccountId,
    );
    const sourceOwner = owners.find((owner) => owner.id === source?.customerId);
    const recipientOwner = owners.find(
      (owner) => owner.id === recipient?.customerId,
    );
    if (!source || !recipient || !sourceOwner || !recipientOwner)
      throw new ApiError(
        409,
        "ACCOUNT_RESTRICTED",
        "Both accounts must have eligible account holders.",
      );

    assertFinancialAccountEligible({ status: source.status, ...sourceOwner });
    assertFinancialAccountEligible({
      status: recipient.status,
      ...recipientOwner,
    });
    if (
      recipient.balancePoisha - recipient.heldBalancePoisha <
      transfer.amountPoisha
    )
      throw new ApiError(
        422,
        "INSUFFICIENT_FUNDS",
        "The recipient does not have enough available funds.",
      );
    const restoredBalance =
      source.balancePoisha + transfer.amountPoisha + transfer.feePoisha;
    if (restoredBalance > maxPoisha)
      throw new ApiError(
        422,
        "ACCOUNT_BALANCE_LIMIT",
        "The original sender cannot accept the refund.",
      );

    const now = new Date();
    await tx
      .update(bankAccounts)
      .set({ balancePoisha: restoredBalance, updatedAt: now })
      .where(eq(bankAccounts.id, source.id));
    await tx
      .update(bankAccounts)
      .set({
        balancePoisha: recipient.balancePoisha - transfer.amountPoisha,
        updatedAt: now,
      })
      .where(eq(bankAccounts.id, recipient.id));
    const [posting] = await tx
      .insert(transactions)
      .values({
        type: "TRANSFER_REVERSAL",
        status: "COMPLETED",
        senderAccountId: recipient.id,
        receiverAccountId: source.id,
        amountPoisha: transfer.amountPoisha,
        refundedFeePoisha: transfer.feePoisha,
        reversesTransactionId: transfer.id,
        reversalReason: reason,
        description: "Transfer reversal",
        initiatedBy: adminId,
        createdAt: now,
      })
      .returning({ reference: transactions.reference });
    await tx
      .update(transactions)
      .set({ status: "REVERSED" })
      .where(eq(transactions.id, transfer.id));
    return { reversalReference: posting.reference };
  });
}
