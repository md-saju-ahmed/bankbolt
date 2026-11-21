import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDatabase } from "../../db/client.ts";
import { transactionFlags, transactions, users } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";

const reporter = alias(users, "flag_reporter");
const resolver = alias(users, "flag_resolver");

export async function listTransactionFlags({
  page,
  status,
  reference,
  flaggedBy,
}: {
  page: number;
  status?: "OPEN" | "RESOLVED";
  reference?: string;
  flaggedBy?: string;
}) {
  const pageSize = 20;
  const rows = await getDatabase()
    .select({
      id: transactionFlags.id,
      reason: transactionFlags.reason,
      createdAt: transactionFlags.createdAt,
      reporterName: reporter.fullName,
      resolvedAt: transactionFlags.resolvedAt,
      resolverName: resolver.fullName,
      resolutionNote: transactionFlags.resolutionNote,
      reference: transactions.reference,
      type: transactions.type,
      amountPoisha: transactions.amountPoisha,
    })
    .from(transactionFlags)
    .innerJoin(
      transactions,
      eq(transactions.id, transactionFlags.transactionId),
    )
    .innerJoin(reporter, eq(reporter.id, transactionFlags.flaggedBy))
    .leftJoin(resolver, eq(resolver.id, transactionFlags.resolvedBy))
    .where(
      and(
        reference ? eq(transactions.reference, reference) : undefined,
        flaggedBy ? eq(transactionFlags.flaggedBy, flaggedBy) : undefined,
        status === "OPEN"
          ? isNull(transactionFlags.resolvedAt)
          : status === "RESOLVED"
            ? isNotNull(transactionFlags.resolvedAt)
            : undefined,
      ),
    )
    .orderBy(desc(transactionFlags.createdAt), desc(transactionFlags.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return {
    flags: rows.slice(0, pageSize).map((row) => ({
      ...row,
      amountPoisha: row.amountPoisha.toString(),
      status: row.resolvedAt ? "RESOLVED" : "OPEN",
    })),
    hasNextPage: rows.length > pageSize,
  };
}

type Reader = Pick<ReturnType<typeof getDatabase>, "select">;

async function lockActor(tx: Reader, id: string, role: "ADMIN" | "STAFF") {
  const [actor] = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, id),
        eq(users.role, role),
        eq(users.accessActive, true),
        eq(users.blocked, false),
      ),
    )
    .for("share");
  if (!actor)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You cannot perform this flag action.",
    );
}

export function flagTransaction(
  reference: string,
  flaggedBy: string,
  reason: string,
) {
  return getDatabase().transaction(async (tx) => {
    await lockActor(tx, flaggedBy, "STAFF");
    const [transaction] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.reference, reference));
    if (!transaction)
      throw new ApiError(404, "NOT_FOUND", "Transaction not found.");
    const [flag] = await tx
      .insert(transactionFlags)
      .values({ transactionId: transaction.id, flaggedBy, reason })
      .onConflictDoNothing({
        target: transactionFlags.transactionId,
        where: isNull(transactionFlags.resolvedAt),
      })
      .returning({ id: transactionFlags.id });
    if (!flag)
      throw new ApiError(
        409,
        "FLAG_ALREADY_OPEN",
        "This transaction already has an open flag.",
      );
    return flag;
  });
}

export function resolveFlag(
  id: string,
  resolvedBy: string,
  resolutionNote?: string,
) {
  return getDatabase().transaction(async (tx) => {
    await lockActor(tx, resolvedBy, "ADMIN");
    const [flag] = await tx
      .update(transactionFlags)
      .set({
        resolvedBy,
        resolvedAt: new Date(),
        resolutionNote: resolutionNote ?? null,
      })
      .where(
        and(eq(transactionFlags.id, id), isNull(transactionFlags.resolvedAt)),
      )
      .returning({ id: transactionFlags.id });
    if (flag) return flag;
    const [existing] = await tx
      .select({ id: transactionFlags.id })
      .from(transactionFlags)
      .where(eq(transactionFlags.id, id));
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Flag not found.");
    throw new ApiError(
      409,
      "FLAG_ALREADY_RESOLVED",
      "This flag has already been resolved.",
    );
  });
}
