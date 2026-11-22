import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  customerProfiles,
  transactions,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import {
  bankingPdf,
  pdfPage,
  pdfPlainText,
  pdfSection,
} from "../../lib/banking-pdf.ts";
import { formatBdtDecimal as bdt } from "../../lib/money.ts";
import { dhakaDayEnd, dhakaDayStart } from "../../lib/dhaka-date.ts";

export const statementDates = z
  .strictObject({
    from: z.iso.date().refine((day) => !day.startsWith("0000-")),
    to: z.iso.date().refine((day) => !day.startsWith("0000-")),
  })
  .refine(({ from, to }) => from <= to, { path: ["to"] });

const reversal = alias(transactions, "statement_reversal");

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

type StatementDates = z.infer<typeof statementDates>;

async function readStatement(
  userId: string,
  accountId: string,
  { from, to }: StatementDates,
  limit?: number,
) {
  return getDatabase().transaction(
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

      const query = db
        .select({
          reference: transactions.reference,
          postedAt: sql<string>`to_char(${transactions.createdAt} at time zone 'Asia/Dhaka', 'YYYY-MM-DD HH24:MI:SS.MS')`,
          type: transactions.type,
          senderAccountId: transactions.senderAccountId,
          amountPoisha: transactions.amountPoisha,
          feePoisha: transactions.feePoisha,
          refundedFeePoisha: transactions.refundedFeePoisha,
          description: transactions.description,
        })
        .from(transactions)
        .leftJoin(reversal, eq(reversal.reversesTransactionId, transactions.id))
        .where(
          and(
            or(
              eq(transactions.status, "COMPLETED"),
              and(
                eq(transactions.status, "REVERSED"),
                sql`${reversal.id} is not null`,
              ),
            ),
            or(
              eq(transactions.senderAccountId, accountId),
              eq(transactions.receiverAccountId, accountId),
            ),
            gte(transactions.createdAt, dhakaDayStart(from)),
            lt(transactions.createdAt, dhakaDayEnd(to)),
          ),
        )
        .orderBy(desc(transactions.createdAt), desc(transactions.reference));
      const rows = await (limit ? query.limit(limit) : query);
      return { accountNumber: account.accountNumber, rows };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

type Posting = Awaited<ReturnType<typeof readStatement>>["rows"][number];

function statementAmounts(row: Posting, accountId: string) {
  const outgoing = row.senderAccountId === accountId;
  const fee = outgoing ? row.feePoisha : 0n;
  return {
    direction: outgoing ? "Debit" : "Credit",
    fee,
    debit: outgoing ? row.amountPoisha + fee : 0n,
    credit: outgoing ? 0n : row.amountPoisha + row.refundedFeePoisha,
  };
}

export async function createStatement(
  userId: string,
  accountId: string,
  dates: StatementDates,
) {
  const { from, to } = dates;
  const { accountNumber, rows } = await readStatement(userId, accountId, dates);
  const lines = rows.map((row) => {
    const { direction, fee, debit, credit } = statementAmounts(row, accountId);
    return csvLine([
      row.reference,
      row.postedAt,
      row.type,
      direction,
      bdt(row.amountPoisha),
      bdt(fee),
      bdt(debit),
      bdt(credit),
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

export async function createStatementPdf(
  userId: string,
  accountId: string,
  dates: StatementDates,
) {
  const limit = 1000;
  const { accountNumber, rows } = await readStatement(
    userId,
    accountId,
    dates,
    limit + 1,
  );
  if (rows.length > limit)
    throw new ApiError(
      413,
      "STATEMENT_TOO_LARGE",
      "Choose a shorter date range.",
    );

  const suffix = accountNumber.slice(-4);
  const subtitle = `Account ending in ${suffix} | ${dates.from} to ${dates.to} | Asia/Dhaka`;
  const pdf = await bankingPdf("Account statement", (doc) => {
    let page = 1;
    pdfPage(doc, "Account statement", subtitle, page);
    if (rows.length === 0)
      doc.fontSize(11).text("No posted transactions in this date range.");
    for (const row of rows) {
      const { direction, fee, debit, credit } = statementAmounts(
        row,
        accountId,
      );
      const description = pdfPlainText(row.description);
      const width =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const descriptionHeight = doc
        .fontSize(10)
        .heightOfString(description, { width });
      if (
        doc.y + descriptionHeight + 105 >
        doc.page.height - doc.page.margins.bottom
      )
        pdfPage(doc, "Account statement", subtitle, ++page);
      pdfSection(
        doc,
        `${row.type.toLowerCase().replaceAll("_", " ")} | ${direction}`,
      );
      doc.fontSize(10).text(`${row.postedAt}  |  ${row.reference}`, { width });
      doc.text(`Amount ${bdt(row.amountPoisha)} BDT  |  Fee ${bdt(fee)} BDT`, {
        width,
      });
      doc.text(`Debit ${bdt(debit)} BDT  |  Credit ${bdt(credit)} BDT`, {
        width,
      });
      doc.text(description, { width }).moveDown(0.8);
    }
  });
  return {
    filename: `bankbolt-statement-${suffix}-${dates.from}-to-${dates.to}.pdf`,
    pdf,
  };
}
