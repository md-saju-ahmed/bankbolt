import { and, desc, eq, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  cashRequests,
  customerProfiles,
  transactions,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { maxPoisha } from "../../lib/money.ts";
import { assertFinancialAccountEligible } from "../accounts/eligibility.ts";
import type { Identity } from "../auth/sessions.ts";
import type { cashRequestFilters, cashRequestInput } from "./validation.ts";

type Reader = Pick<ReturnType<typeof getDatabase>, "select">;
type CashRequest = typeof cashRequests.$inferSelect;
type Decision = { status: "APPROVED" } | { status: "REJECTED"; reason: string };

function requestView(
  request: CashRequest,
  accountNumber: string,
  transactionReference: string | null = null,
) {
  return {
    ...request,
    accountNumber,
    amountPoisha: request.amountPoisha.toString(),
    transactionReference,
  };
}

function scopedRequests(identity: Identity, condition?: SQL) {
  const scope =
    identity.role === "CUSTOMER"
      ? eq(customerProfiles.userId, identity.id)
      : undefined;
  return getDatabase()
    .select({
      request: cashRequests,
      accountNumber: bankAccounts.accountNumber,
      reference: transactions.reference,
    })
    .from(cashRequests)
    .innerJoin(
      customerProfiles,
      eq(customerProfiles.id, cashRequests.customerId),
    )
    .innerJoin(
      bankAccounts,
      and(
        eq(bankAccounts.id, cashRequests.accountId),
        eq(bankAccounts.customerId, cashRequests.customerId),
      ),
    )
    .leftJoin(transactions, eq(transactions.cashRequestId, cashRequests.id))
    .where(and(scope, condition));
}

export async function listCashRequests(
  identity: Identity,
  filters: z.infer<typeof cashRequestFilters>,
) {
  const pageSize = 20;
  const rows = await scopedRequests(
    identity,
    and(
      filters.status ? eq(cashRequests.status, filters.status) : undefined,
      filters.type ? eq(cashRequests.type, filters.type) : undefined,
    ),
  )
    .orderBy(desc(cashRequests.createdAt), desc(cashRequests.id))
    .limit(pageSize + 1)
    .offset((filters.page - 1) * pageSize);
  return {
    requests: rows
      .slice(0, pageSize)
      .map((row) => requestView(row.request, row.accountNumber, row.reference)),
    hasNextPage: rows.length > pageSize,
  };
}

const missingRequest = () =>
  new ApiError(404, "NOT_FOUND", "Cash request not found.");
const missingAccount = () =>
  new ApiError(404, "NOT_FOUND", "Bank account not found.");

export async function getCashRequest(identity: Identity, id: string) {
  const [row] = await scopedRequests(identity, eq(cashRequests.id, id));
  if (!row) throw missingRequest();
  return requestView(row.request, row.accountNumber, row.reference);
}

function lockOwner(tx: Reader, condition: SQL) {
  return tx
    .select({
      id: customerProfiles.id,
      userId: users.id,
      role: users.role,
      blocked: users.blocked,
      accessActive: users.accessActive,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(condition)
    .for("share", { of: [customerProfiles, users] });
}

export function createCashRequest(
  userId: string,
  input: z.infer<typeof cashRequestInput>,
) {
  return getDatabase().transaction(async (tx) => {
    const [owner] = await lockOwner(tx, eq(customerProfiles.userId, userId));
    if (!owner || owner.role !== "CUSTOMER") throw missingAccount();
    const [account] = await tx
      .select({
        number: bankAccounts.accountNumber,
        status: bankAccounts.status,
      })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, input.accountId),
          eq(bankAccounts.customerId, owner.id),
        ),
      )
      .for("share");
    if (!account) throw missingAccount();
    assertFinancialAccountEligible({ status: account.status, ...owner });

    const [created] = await tx
      .insert(cashRequests)
      .values({ ...input, customerId: owner.id })
      .returning();
    return requestView(created, account.number);
  });
}

export function decideCashRequest(
  reviewerId: string,
  id: string,
  decision: Decision,
) {
  return getDatabase().transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(cashRequests)
      .where(eq(cashRequests.id, id))
      .for("no key update");
    if (!request) throw missingRequest();
    const [owner] = await lockOwner(
      tx,
      eq(customerProfiles.id, request.customerId),
    );
    if (!owner) throw missingRequest();
    if (owner.userId === reviewerId) {
      throw new ApiError(
        403,
        "SELF_REVIEW",
        "You cannot review your own cash request.",
      );
    }

    const [reviewer] = await tx
      .select({
        role: users.role,
        blocked: users.blocked,
        active: users.accessActive,
      })
      .from(users)
      .where(eq(users.id, reviewerId))
      .for("share");
    if (
      !reviewer ||
      reviewer.blocked ||
      !reviewer.active ||
      (reviewer.role !== "ADMIN" && reviewer.role !== "STAFF")
    ) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "This cash request requires an active Staff or Admin reviewer.",
      );
    }
    if (request.status !== "PENDING") {
      throw new ApiError(
        409,
        "CASH_REQUEST_DECIDED",
        "This cash request has already been decided.",
      );
    }

    const [account] = await tx
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, request.accountId),
          eq(bankAccounts.customerId, owner.id),
        ),
      )
      .for("no key update");
    if (!account) throw missingAccount();
    const reviewedAt = new Date();
    let transactionReference: string | null = null;
    if (decision.status === "APPROVED") {
      if (owner.role !== "CUSTOMER") {
        throw new ApiError(
          409,
          "ACCOUNT_RESTRICTED",
          "The account holder is no longer eligible.",
        );
      }
      assertFinancialAccountEligible({ status: account.status, ...owner });
      const deposit = request.type === "DEPOSIT";
      const balancePoisha =
        account.balancePoisha +
        (deposit ? request.amountPoisha : -request.amountPoisha);
      if (balancePoisha < 0n) {
        throw new ApiError(
          422,
          "INSUFFICIENT_FUNDS",
          "The account cannot cover the withdrawal.",
        );
      }
      if (balancePoisha > maxPoisha) {
        throw new ApiError(
          422,
          "ACCOUNT_BALANCE_LIMIT",
          "The account cannot accept this deposit.",
        );
      }
      await tx
        .update(bankAccounts)
        .set({ balancePoisha, updatedAt: reviewedAt })
        .where(eq(bankAccounts.id, account.id));
      const [posting] = await tx
        .insert(transactions)
        .values({
          type: request.type,
          status: "COMPLETED",
          amountPoisha: request.amountPoisha,
          senderAccountId: deposit ? null : account.id,
          receiverAccountId: deposit ? account.id : null,
          description: request.description,
          createdAt: reviewedAt,
          initiatedBy: reviewerId,
          cashRequestId: request.id,
        })
        .returning({ reference: transactions.reference });
      transactionReference = posting.reference;
    }
    const [updated] = await tx
      .update(cashRequests)
      .set({
        status: decision.status,
        reviewedBy: reviewerId,
        reviewedAt,
        rejectionReason:
          decision.status === "REJECTED" ? decision.reason : null,
      })
      .where(eq(cashRequests.id, request.id))
      .returning();
    return requestView(updated, account.accountNumber, transactionReference);
  });
}
