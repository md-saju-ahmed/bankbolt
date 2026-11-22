import { and, eq, gte, lte, ne, or } from "drizzle-orm";
import type { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  transactionFlags,
  transactions,
} from "../../db/schema.ts";

const minimumLargeTransfer = 2_500_000n;
const minimumLargeCashPosting = 5_000_000n;
const velocityWindowMs = 10 * 60_000;
const recentTransferLimit = 2;

const ruleReasons = {
  LARGE_EXTERNAL_TRANSFER: "External transfer of at least BDT 25,000.",
  RAPID_EXTERNAL_TRANSFERS:
    "Third or later external transfer from the same account within 10 minutes.",
  LARGE_CASH_POSTING: "Cash posting of at least BDT 50,000.",
} as const;
type Rule = keyof typeof ruleReasons;
type Posting = Pick<typeof transactions.$inferSelect, "id" | "createdAt">;
type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

async function recordFlag(tx: Transaction, posting: Posting, rules: Rule[]) {
  if (!rules.length) return;
  await tx
    .insert(transactionFlags)
    .values({
      transactionId: posting.id,
      createdAt: posting.createdAt,
      automatedRules: rules,
      reason: rules.map((rule) => ruleReasons[rule]).join(" "),
    })
    .onConflictDoNothing();
}

export async function flagExternalTransfer(
  tx: Transaction,
  posting: Posting & { amountPoisha: bigint },
  sourceAccountId: string,
  sourceCustomerId: string,
) {
  const rules: Rule[] = [];
  if (posting.amountPoisha >= minimumLargeTransfer)
    rules.push("LARGE_EXTERNAL_TRANSFER");

  // The posting workflow holds the source account lock, serializing the velocity check.
  const windowStart = new Date(posting.createdAt.getTime() - velocityWindowMs);
  const recent = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(
      bankAccounts,
      eq(bankAccounts.id, transactions.receiverAccountId),
    )
    .where(
      and(
        eq(transactions.senderAccountId, sourceAccountId),
        ne(bankAccounts.customerId, sourceCustomerId),
        eq(transactions.type, "FUND_TRANSFER"),
        or(
          eq(transactions.status, "COMPLETED"),
          eq(transactions.status, "REVERSED"),
        ),
        ne(transactions.id, posting.id),
        gte(transactions.createdAt, windowStart),
        lte(transactions.createdAt, posting.createdAt),
      ),
    )
    .limit(recentTransferLimit);
  if (recent.length === recentTransferLimit)
    rules.push("RAPID_EXTERNAL_TRANSFERS");
  await recordFlag(tx, posting, rules);
}

export async function flagCashPosting(
  tx: Transaction,
  posting: Posting,
  amountPoisha: bigint,
) {
  if (amountPoisha >= minimumLargeCashPosting)
    await recordFlag(tx, posting, ["LARGE_CASH_POSTING"]);
}
