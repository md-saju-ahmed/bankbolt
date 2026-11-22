import { and, desc, eq, gte, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  customerProfiles,
  transactions,
  transactionType,
  transactionStatus,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import {
  bankingPdf,
  pdfField,
  pdfPage,
  pdfSection,
} from "../../lib/banking-pdf.ts";
import { formatBdtDecimal } from "../../lib/money.ts";
import { dhakaDayEnd, dhakaDayStart } from "../../lib/dhaka-date.ts";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { requireAuthenticator } from "../auth/two-factor.ts";
import { reverseTransfer, reversalInput } from "./reversal.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import type { Identity } from "../auth/sessions.ts";
import { pages } from "../onboarding/validation.ts";
import { relatedFlagsRouter } from "../transaction-flags/routes.ts";

const search = pages
  .extend({
    customerId: z.uuid().optional(),
    reference: z
      .string()
      .trim()
      .max(36)
      .regex(/^[0-9a-f-]*$/i)
      .optional(),
    from: z.iso
      .date()
      .refine((date) => date >= "0001-01-01")
      .optional(),
    to: z.iso
      .date()
      .refine((date) => date >= "0001-01-01")
      .optional(),
    type: z.enum(transactionType.enumValues).optional(),
    status: z.enum(transactionStatus.enumValues).optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to);
const original = alias(transactions, "original");
const reversal = alias(transactions, "reversal");
const sender = alias(bankAccounts, "sender");
const receiver = alias(bankAccounts, "receiver");
const senderOwner = alias(customerProfiles, "sender_owner");
const receiverOwner = alias(customerProfiles, "receiver_owner");

function scopedTransactions(identity: Identity, condition?: SQL) {
  const scope =
    identity.role === "CUSTOMER"
      ? or(
          eq(senderOwner.userId, identity.id),
          eq(receiverOwner.userId, identity.id),
        )
      : undefined;
  return getDatabase()
    .select({
      transaction: transactions,
      originalReference: original.reference,
      reversalReference: reversal.reference,
      senderNumber: sender.accountNumber,
      receiverNumber: receiver.accountNumber,
      senderUserId: senderOwner.userId,
      receiverUserId: receiverOwner.userId,
    })
    .from(transactions)
    .leftJoin(original, eq(original.id, transactions.reversesTransactionId))
    .leftJoin(reversal, eq(reversal.reversesTransactionId, transactions.id))
    .leftJoin(sender, eq(sender.id, transactions.senderAccountId))
    .leftJoin(receiver, eq(receiver.id, transactions.receiverAccountId))
    .leftJoin(senderOwner, eq(senderOwner.id, sender.customerId))
    .leftJoin(receiverOwner, eq(receiverOwner.id, receiver.customerId))
    .where(and(scope, condition));
}

type TransactionRow = Awaited<ReturnType<typeof scopedTransactions>>[number];

function transactionView(identity: Identity, row: TransactionRow) {
  const { transaction, senderNumber, receiverNumber } = row;
  const ownSender = row.senderUserId === identity.id;
  const ownReceiver = row.receiverUserId === identity.id;
  const direction =
    identity.role !== "CUSTOMER"
      ? null
      : ownSender && ownReceiver
        ? "INTERNAL"
        : ownSender
          ? "OUTGOING"
          : "INCOMING";
  return {
    reference: transaction.reference,
    senderNumber,
    receiverNumber,
    type: transaction.type,
    status: transaction.status,
    amountPoisha: transaction.amountPoisha.toString(),
    feePoisha: transaction.feePoisha.toString(),
    description: transaction.description,
    originalReference: row.originalReference,
    reversalReference: row.reversalReference,
    refundedFeePoisha: transaction.refundedFeePoisha.toString(),
    ...(identity.role === "ADMIN" && transaction.reversalReason !== null
      ? { reversalReason: transaction.reversalReason }
      : {}),
    createdAt: transaction.createdAt,
    direction,
  };
}

export const transactionsRouter = Router();
transactionsRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
transactionsRouter.use(requireAuth, requireRole("CUSTOMER", "STAFF", "ADMIN"));
transactionsRouter.use("/:reference", relatedFlagsRouter);

transactionsRouter.get("/", async (request, response) => {
  const filters = search.parse(request.query);
  const identity = currentIdentity(request);
  if (filters.customerId && identity.role !== "ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Only Admin can filter by customer.");
  }
  const pageSize = 20;
  const rows = await scopedTransactions(
    identity,
    and(
      filters.customerId
        ? or(
            eq(senderOwner.id, filters.customerId),
            eq(receiverOwner.id, filters.customerId),
          )
        : undefined,
      filters.reference
        ? sql`${transactions.reference}::text like ${filters.reference.toLowerCase() + "%"}`
        : undefined,
      filters.type ? eq(transactions.type, filters.type) : undefined,
      filters.status ? eq(transactions.status, filters.status) : undefined,
      filters.from
        ? gte(transactions.createdAt, dhakaDayStart(filters.from))
        : undefined,
      filters.to
        ? lt(transactions.createdAt, dhakaDayEnd(filters.to))
        : undefined,
    ),
  )
    .orderBy(desc(transactions.createdAt), desc(transactions.reference))
    .limit(pageSize + 1)
    .offset((filters.page - 1) * pageSize);
  response.json({
    transactions: rows
      .slice(0, pageSize)
      .map((row) => transactionView(identity, row)),
    hasNextPage: rows.length > pageSize,
  });
});

async function transactionDetail(
  identity: Identity,
  reference: string,
  receipt = false,
) {
  const [row] = await scopedTransactions(
    identity,
    and(
      eq(transactions.reference, reference),
      receipt
        ? or(
            eq(transactions.status, "COMPLETED"),
            and(
              eq(transactions.status, "REVERSED"),
              eq(transactions.type, "FUND_TRANSFER"),
              sql`${reversal.id} is not null`,
            ),
          )
        : undefined,
    ),
  );
  if (!row)
    throw new ApiError(
      404,
      "NOT_FOUND",
      receipt ? "Receipt not found." : "Transaction not found.",
    );
  return transactionView(identity, row);
}

transactionsRouter.post(
  "/:reference/reverse",
  requireWebOrigin,
  requireRole("ADMIN"),
  requireAuthenticator,
  async (request, response) => {
    const reference = z.uuid().parse(request.params.reference);
    const { reason } = reversalInput.parse(request.body);
    response
      .status(201)
      .json(
        await reverseTransfer(currentIdentity(request).id, reference, reason),
      );
  },
);

transactionsRouter.get("/:reference", async (request, response) => {
  const reference = z.uuid().parse(request.params.reference);
  response.json({
    transaction: await transactionDetail(currentIdentity(request), reference),
  });
});

transactionsRouter.get("/:reference/receipt", async (request, response) => {
  const reference = z.uuid().parse(request.params.reference);
  response.json({
    transaction: await transactionDetail(
      currentIdentity(request),
      reference,
      true,
    ),
  });
});

const receiptDate = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Dhaka",
});
const receiptLabels = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  FUND_TRANSFER: "Fund transfer",
  TRANSFER_REVERSAL: "Transfer reversal",
  LOAN_DISBURSEMENT: "Loan disbursement",
  LOAN_REPAYMENT: "Loan repayment",
};

transactionsRouter.get("/:reference/receipt.pdf", async (request, response) => {
  const reference = z.uuid().parse(request.params.reference);
  const transaction = await transactionDetail(
    currentIdentity(request),
    reference,
    true,
  );
  const bdt = (poisha: string | bigint) =>
    formatBdtDecimal(BigInt(poisha)) + " BDT";
  const pdf = await bankingPdf("Transaction receipt", (doc) => {
    pdfPage(
      doc,
      "Transaction receipt",
      receiptDate.format(transaction.createdAt) + " | Asia/Dhaka",
    );
    pdfSection(doc, receiptLabels[transaction.type]);
    pdfField(doc, "Reference", transaction.reference);
    pdfField(
      doc,
      "Status",
      transaction.status === "REVERSED" ? "Reversed" : "Completed",
    );
    if (transaction.senderNumber)
      pdfField(doc, "Sender account", transaction.senderNumber);
    if (transaction.receiverNumber)
      pdfField(doc, "Receiver account", transaction.receiverNumber);
    pdfField(doc, "Amount", bdt(transaction.amountPoisha));
    pdfField(doc, "Transaction fee", bdt(transaction.feePoisha));
    if (transaction.senderNumber && transaction.direction !== "INCOMING")
      pdfField(
        doc,
        "Total debit",
        bdt(BigInt(transaction.amountPoisha) + BigInt(transaction.feePoisha)),
      );
    if (
      transaction.type === "TRANSFER_REVERSAL" &&
      transaction.direction !== "OUTGOING"
    ) {
      pdfField(
        doc,
        "Original fee refunded",
        bdt(transaction.refundedFeePoisha),
      );
      pdfField(
        doc,
        "Total credit",
        bdt(
          BigInt(transaction.amountPoisha) +
            BigInt(transaction.refundedFeePoisha),
        ),
      );
    }
    if (transaction.originalReference)
      pdfField(doc, "Original transfer", transaction.originalReference);
    if (transaction.reversalReference)
      pdfField(doc, "Reversal transaction", transaction.reversalReference);
    pdfField(doc, "Description", transaction.description);
  });
  response
    .attachment(`bankbolt-receipt-${transaction.reference}.pdf`)
    .type("application/pdf")
    .send(pdf);
});
