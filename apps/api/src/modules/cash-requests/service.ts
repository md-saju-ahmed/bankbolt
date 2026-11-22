import { and, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
import { flagCashPosting } from "../transaction-flags/detection.ts";
import type { Identity } from "../auth/sessions.ts";
import type { cashRequestFilters, cashRequestInput } from "./validation.ts";

type Reader = Pick<ReturnType<typeof getDatabase>, "select">;
type CashRequest = typeof cashRequests.$inferSelect;
type Decision =
  { status: "APPROVED" | "CANCELLED" } | { status: "REJECTED"; reason: string };
const requester = alias(users, "cash_requester");
const reviewActor = alias(users, "cash_reviewer");

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
      customerName: requester.fullName,
      reviewerName: reviewActor.fullName,
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
    .innerJoin(requester, eq(requester.id, customerProfiles.userId))
    .leftJoin(reviewActor, eq(reviewActor.id, cashRequests.reviewedBy))
    .where(and(scope, condition));
}

type CashRequestRow = Awaited<ReturnType<typeof scopedRequests>>[number];

function scopedView(identity: Identity, row: CashRequestRow) {
  const view = requestView(row.request, row.accountNumber, row.reference);
  return identity.role === "CUSTOMER"
    ? view
    : {
        ...view,
        customerName: row.customerName,
        reviewerName: row.reviewerName,
      };
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
    requests: rows.slice(0, pageSize).map((row) => scopedView(identity, row)),
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
  return scopedView(identity, row);
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
        balancePoisha: bankAccounts.balancePoisha,
        heldBalancePoisha: bankAccounts.heldBalancePoisha,
      })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, input.accountId),
          eq(bankAccounts.customerId, owner.id),
        ),
      )
      .for("no key update");
    if (!account) throw missingAccount();
    assertFinancialAccountEligible({ status: account.status, ...owner });

    const fundsReserved = input.type === "WITHDRAWAL";
    if (fundsReserved) {
      if (
        input.amountPoisha >
        account.balancePoisha - account.heldBalancePoisha
      ) {
        throw new ApiError(
          422,
          "INSUFFICIENT_FUNDS",
          "The account cannot cover the withdrawal.",
        );
      }
      await tx
        .update(bankAccounts)
        .set({
          heldBalancePoisha: account.heldBalancePoisha + input.amountPoisha,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, input.accountId));
    }

    const [created] = await tx
      .insert(cashRequests)
      .values({ ...input, customerId: owner.id, fundsReserved })
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
    const cancelled = decision.status === "CANCELLED";
    if (cancelled) {
      if (
        owner.userId !== reviewerId ||
        owner.role !== "CUSTOMER" ||
        owner.blocked ||
        !owner.accessActive
      ) {
        throw missingRequest();
      }
    } else {
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
    const heldBalancePoisha =
      account.heldBalancePoisha -
      (request.fundsReserved ? request.amountPoisha : 0n);
    if (request.fundsReserved && decision.status !== "APPROVED") {
      await tx
        .update(bankAccounts)
        .set({ heldBalancePoisha, updatedAt: reviewedAt })
        .where(eq(bankAccounts.id, account.id));
    }
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
      if (balancePoisha < heldBalancePoisha) {
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
        .set({ balancePoisha, heldBalancePoisha, updatedAt: reviewedAt })
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
        .returning({
          id: transactions.id,
          createdAt: transactions.createdAt,
          reference: transactions.reference,
        });
      await flagCashPosting(tx, posting, request.amountPoisha);
      transactionReference = posting.reference;
    }
    const [updated] = await tx
      .update(cashRequests)
      .set({
        status: decision.status,
        reviewedBy: cancelled ? null : reviewerId,
        reviewedAt: cancelled ? null : reviewedAt,
        cancelledAt: cancelled ? reviewedAt : null,
        fundsReserved: false,
        rejectionReason:
          decision.status === "REJECTED" ? decision.reason : null,
      })
      .where(eq(cashRequests.id, request.id))
      .returning();
    return requestView(updated, account.accountNumber, transactionReference);
  });
}
