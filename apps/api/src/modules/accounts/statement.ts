import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  customerProfiles,
  transactions,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { dhakaDayEnd, dhakaDayStart } from "../../lib/dhaka-date.ts";

export const statementDates = z
  .strictObject({
    from: z.iso.date().refine((day) => !day.startsWith("0000-")),
    to: z.iso.date().refine((day) => !day.startsWith("0000-")),
  })
  .refine(({ from, to }) => from <= to, { path: ["to"] });

const header = [
  "Reference",
  "Posted at (Asia/Dhaka)",
  "Type",
  "Direction",
  "Amount (BDT)",
  "Fee (BDT)",
  "Debit (BDT)",
  "Credit (BDT)",
  "Description",
];

function csvLine(cells: string[]) {
  return cells
    .map((cell) => {
      // Guard spreadsheet formula prefixes even if whitespace is trimmed on import.
      const formulaPrefix = /^[\s\p{Cf}]*[=+\-@＝＋－＠]/u;
      const leadingLineBreak = /^[\p{Zs}\p{Cf}]*[\t\r\n]/u;
      const safe =
        formulaPrefix.test(cell) || leadingLineBreak.test(cell)
          ? `'${cell}`
          : cell;
      return `"${safe.replaceAll('"', '""')}"`;
    })
    .join(",");
}

function bdt(poisha: bigint) {
  return `${poisha / 100n}.${String(poisha % 100n).padStart(2, "0")}`;
}

export async function createStatement(
  userId: string,
  accountId: string,
  { from, to }: z.infer<typeof statementDates>,
) {
  const { accountNumber, rows } = await getDatabase().transaction(
    async (db) => {
      const [account] = await db
        .select({ accountNumber: bankAccounts.accountNumber })
        .from(bankAccounts)
        .innerJoin(
          customerProfiles,
          eq(customerProfiles.id, bankAccounts.customerId),
        )
        .where(
          and(
            eq(bankAccounts.id, accountId),
            eq(customerProfiles.userId, userId),
          ),
        );
      if (!account)
        throw new ApiError(404, "NOT_FOUND", "Bank account not found.");

      const rows = await db
        .select({
          reference: transactions.reference,
          postedAt: sql<string>`to_char(${transactions.createdAt} at time zone 'Asia/Dhaka', 'YYYY-MM-DD HH24:MI:SS.MS')`,
          type: transactions.type,
          senderAccountId: transactions.senderAccountId,
          amountPoisha: transactions.amountPoisha,
          feePoisha: transactions.feePoisha,
          description: transactions.description,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.status, "COMPLETED"),
            or(
              eq(transactions.senderAccountId, accountId),
              eq(transactions.receiverAccountId, accountId),
            ),
            gte(transactions.createdAt, dhakaDayStart(from)),
            lt(transactions.createdAt, dhakaDayEnd(to)),
          ),
        )
        .orderBy(desc(transactions.createdAt), desc(transactions.reference));
      return { accountNumber: account.accountNumber, rows };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );

  const lines = rows.map((row) => {
    const debit = row.senderAccountId === accountId;
    const fee = debit ? row.feePoisha : 0n;
    return csvLine([
      row.reference,
      row.postedAt,
      row.type,
      debit ? "Debit" : "Credit",
      bdt(row.amountPoisha),
      bdt(fee),
      bdt(debit ? row.amountPoisha + fee : 0n),
      bdt(debit ? 0n : row.amountPoisha),
      row.description,
    ]);
  });
  const csv = `\uFEFF${[csvLine(header), ...lines].join("\r\n")}\r\n`;
  // Keep the buffered CSV within the Vercel Functions response body limit.
  if (Buffer.byteLength(csv) > 4_500_000) {
    throw new ApiError(
      413,
      "STATEMENT_TOO_LARGE",
      "Choose a shorter date range.",
    );
  }

  return {
    filename: `bankbolt-statement-${accountNumber.slice(-4)}-${from}-to-${to}.csv`,
    csv,
  };
}
