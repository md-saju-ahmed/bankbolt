import { and, asc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  customerProfiles,
  transactions,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { dhakaDate } from "../../lib/dhaka-date.ts";
import { maxPoisha } from "../../lib/money.ts";
import { assertFinancialAccountEligible } from "../accounts/eligibility.ts";
import { verifyTransactionPin } from "../auth/customer-scope.ts";
import type { Identity } from "../auth/sessions.ts";
import type { transferRequest } from "./validation.ts";

type Reader = Pick<ReturnType<typeof getDatabase>, "select">;
type TransferInput = z.infer<typeof transferRequest>;
type TransferRecord = typeof transactions.$inferSelect;

function transferView(record: TransferRecord, recipientAccountNumber: string) {
  return {
    reference: record.reference,
    sourceAccountId: record.senderAccountId,
    recipientAccountNumber,
    type: record.type,
    status: record.status,
    amountPoisha: record.amountPoisha.toString(),
    feePoisha: record.feePoisha.toString(),
    totalDebitPoisha: (record.amountPoisha + record.feePoisha).toString(),
    createdAt: record.createdAt,
    description: record.description,
  };
}

async function findTransfer(db: Reader, userId: string, key: string) {
  const [existing] = await db
    .select({
      record: transactions,
      recipientAccountNumber: bankAccounts.accountNumber,
    })
    .from(transactions)
    .innerJoin(
      bankAccounts,
      eq(bankAccounts.id, transactions.receiverAccountId),
    )
    .where(
      and(
        eq(transactions.initiatedBy, userId),
        eq(transactions.idempotencyKey, key),
        eq(transactions.type, "FUND_TRANSFER"),
      ),
    );
  return (
    existing && transferView(existing.record, existing.recipientAccountNumber)
  );
}

export async function recoverTransfer(userId: string, idempotencyKey: string) {
  const transfer = await findTransfer(getDatabase(), userId, idempotencyKey);
  if (!transfer)
    throw new ApiError(
      404,
      "TRANSFER_NOT_FOUND",
      "No transfer was found for this request.",
    );
  return transfer;
}

function replay(
  transfer: ReturnType<typeof transferView>,
  input: TransferInput,
) {
  if (
    transfer.sourceAccountId !== input.sourceAccountId ||
    transfer.recipientAccountNumber !== input.recipientAccountNumber ||
    transfer.amountPoisha !== input.amountPoisha.toString() ||
    transfer.description !== input.description
  ) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "This request key was already used for a different transfer.",
    );
  }
  return { transfer, replayed: true };
}

export async function createTransfer(identity: Identity, input: TransferInput) {
  const db = getDatabase();
  const existing = await findTransfer(db, identity.id, input.idempotencyKey);
  if (existing) return replay(existing, input);
  const pinHash = await verifyTransactionPin(identity, input.pin);

  return db.transaction(async (tx) => {
    // Serialize reuse of the same customer key even when the payload names different accounts.
    const lockKey = `bankbolt:transfer:${identity.id}:${input.idempotencyKey}`;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
    const committed = await findTransfer(tx, identity.id, input.idempotencyKey);
    if (committed) return replay(committed, input);

    const accountCandidates = await tx
      .select({
        id: bankAccounts.id,
        number: bankAccounts.accountNumber,
        owner: bankAccounts.customerId,
      })
      .from(bankAccounts)
      .where(
        or(
          eq(bankAccounts.id, input.sourceAccountId),
          eq(bankAccounts.accountNumber, input.recipientAccountNumber),
        ),
      );
    const sourceCandidate = accountCandidates.find(
      (account) => account.id === input.sourceAccountId,
    );
    const recipientCandidate = accountCandidates.find(
      (account) => account.number === input.recipientAccountNumber,
    );
    if (!sourceCandidate)
      throw new ApiError(404, "SOURCE_NOT_FOUND", "Source account not found.");

    // Lock owners before accounts, matching onboarding and account activation.
    const ownerIds = [
      ...new Set([
        sourceCandidate.owner,
        ...(recipientCandidate ? [recipientCandidate.owner] : []),
      ]),
    ];
    const owners = await tx
      .select({
        id: customerProfiles.id,
        userId: customerProfiles.userId,
        pinHash: sql<
          string | null
        >`case when ${customerProfiles.userId} = ${identity.id} then ${customerProfiles.pinHash} end`,
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
    const sourceOwner = owners.find(
      (owner) => owner.id === sourceCandidate.owner,
    );
    if (!sourceOwner || sourceOwner.userId !== identity.id) {
      throw new ApiError(404, "SOURCE_NOT_FOUND", "Source account not found.");
    }
    if (sourceOwner.pinHash !== pinHash) {
      throw new ApiError(
        409,
        "PIN_CHANGED",
        "The transaction PIN changed. Please try again.",
      );
    }
    if (!recipientCandidate) {
      throw new ApiError(
        404,
        "RECIPIENT_NOT_FOUND",
        "Recipient account not found.",
      );
    }
    if (sourceCandidate.id === recipientCandidate.id) {
      throw new ApiError(
        422,
        "SAME_ACCOUNT",
        "Choose a different recipient account.",
      );
    }
    const recipientOwner = owners.find(
      (owner) => owner.id === recipientCandidate.owner,
    );
    if (!recipientOwner)
      throw new ApiError(
        404,
        "RECIPIENT_NOT_FOUND",
        "Recipient account not found.",
      );

    const accounts = await tx
      .select()
      .from(bankAccounts)
      .where(
        inArray(bankAccounts.id, [sourceCandidate.id, recipientCandidate.id]),
      )
      .orderBy(asc(bankAccounts.id))
      .for("no key update");
    const source = accounts.find(
      (account) =>
        account.id === sourceCandidate.id &&
        account.customerId === sourceOwner.id,
    );
    const recipient = accounts.find(
      (account) =>
        account.id === recipientCandidate.id &&
        account.customerId === recipientOwner.id,
    );
    if (!source)
      throw new ApiError(404, "SOURCE_NOT_FOUND", "Source account not found.");
    if (!recipient)
      throw new ApiError(
        404,
        "RECIPIENT_NOT_FOUND",
        "Recipient account not found.",
      );
    assertFinancialAccountEligible({ status: source.status, ...sourceOwner });
    assertFinancialAccountEligible({
      status: recipient.status,
      ...recipientOwner,
    });

    const { amountPoisha } = input;
    const feePoisha = source.customerId === recipient.customerId ? 0n : 1_000n;
    const totalDebit = amountPoisha + feePoisha;
    if (amountPoisha > source.transferLimitPoisha) {
      throw new ApiError(
        422,
        "TRANSFER_LIMIT_EXCEEDED",
        "The amount exceeds the account's per-transfer limit.",
      );
    }
    if (totalDebit > source.balancePoisha) {
      throw new ApiError(
        422,
        "INSUFFICIENT_FUNDS",
        "The source account cannot cover the amount and fee.",
      );
    }
    const recipientBalance = recipient.balancePoisha + amountPoisha;
    if (recipientBalance > maxPoisha) {
      throw new ApiError(
        422,
        "RECIPIENT_BALANCE_LIMIT",
        "The recipient account cannot accept this amount.",
      );
    }

    // Take the posting date after waiting for locks. Use it for both the limit and the saved transfer.
    const postedAt = new Date();
    const day = dhakaDate(postedAt);
    const [{ total }] = await tx
      .select({
        total: sql<string>`coalesce(sum(${transactions.amountPoisha}), 0)::text`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.senderAccountId, source.id),
          eq(transactions.type, "FUND_TRANSFER"),
          eq(transactions.status, "COMPLETED"),
          gte(
            transactions.createdAt,
            sql`${day}::date::timestamp at time zone 'Asia/Dhaka'`,
          ),
          lt(
            transactions.createdAt,
            sql`(${day}::date + 1)::timestamp at time zone 'Asia/Dhaka'`,
          ),
        ),
      );
    if (BigInt(total) + amountPoisha > source.dailyTransferLimitPoisha) {
      throw new ApiError(
        422,
        "DAILY_TRANSFER_LIMIT_EXCEEDED",
        "The amount exceeds the account's daily transfer limit.",
      );
    }

    await tx
      .update(bankAccounts)
      .set({
        balancePoisha: source.balancePoisha - totalDebit,
        updatedAt: postedAt,
      })
      .where(eq(bankAccounts.id, source.id));
    await tx
      .update(bankAccounts)
      .set({ balancePoisha: recipientBalance, updatedAt: postedAt })
      .where(eq(bankAccounts.id, recipient.id));
    const [record] = await tx
      .insert(transactions)
      .values({
        senderAccountId: source.id,
        receiverAccountId: recipient.id,
        type: "FUND_TRANSFER",
        status: "COMPLETED",
        amountPoisha,
        feePoisha,
        description: input.description,
        initiatedBy: identity.id,
        idempotencyKey: input.idempotencyKey,
        createdAt: postedAt,
      })
      .returning();
    return {
      transfer: transferView(record, recipient.accountNumber),
      replayed: false,
    };
  });
}
