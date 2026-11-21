import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  cashRequests,
  customerProfiles,
  loans,
  transactions,
  transactionFlags,
  transactionStatus,
  transactionType,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { dhakaDayEnd, dhakaDayStart } from "../../lib/dhaka-date.ts";
import type { reportPeriod } from "./period.ts";

type Period = ReturnType<typeof reportPeriod>;
type ReportTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type CustomerScope = { customerId: string; accountId?: string };

const sender = alias(bankAccounts, "report_sender");
const receiver = alias(bankAccounts, "report_receiver");
const month = sql<string>`to_char(${transactions.createdAt} at time zone 'Asia/Dhaka', 'YYYY-MM')`;

function reportSnapshot<T>(read: (db: ReportTransaction) => Promise<T>) {
  return getDatabase().transaction(read, {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

function activityRange(period: Period) {
  return and(
    gte(transactions.createdAt, dhakaDayStart(period.from)),
    lt(transactions.createdAt, dhakaDayEnd(period.to)),
  );
}

function customerActivity(scope: CustomerScope) {
  return and(
    or(
      eq(sender.customerId, scope.customerId),
      eq(receiver.customerId, scope.customerId),
    ),
    scope.accountId
      ? or(
          eq(transactions.senderAccountId, scope.accountId),
          eq(transactions.receiverAccountId, scope.accountId),
        )
      : undefined,
  );
}

function activityGroups(
  db: ReportTransaction,
  period: Period,
  scope?: CustomerScope,
) {
  // Spending is actual outgoing principal and fees, excluding transfers between the customer's own accounts.
  const spending = scope
    ? sql`case when ${and(eq(sender.customerId, scope.customerId), scope.accountId ? eq(transactions.senderAccountId, scope.accountId) : undefined)}
    and (${transactions.type} in ('WITHDRAWAL', 'LOAN_REPAYMENT') or (${transactions.type} = 'FUND_TRANSFER' and ${sender.customerId} is distinct from ${receiver.customerId}))
    then ${transactions.amountPoisha}::numeric + ${transactions.feePoisha} else 0 end`
    : sql`0`;

  return db
    .select({
      month,
      type: transactions.type,
      status: transactions.status,
      count: count(),
      amount: sql<string>`sum(${transactions.amountPoisha})::text`,
      spending: sql<string>`sum((${spending})::numeric)::text`,
    })
    .from(transactions)
    .leftJoin(sender, eq(sender.id, transactions.senderAccountId))
    .leftJoin(receiver, eq(receiver.id, transactions.receiverAccountId))
    .where(
      and(activityRange(period), scope ? customerActivity(scope) : undefined),
    )
    .groupBy(month, transactions.type, transactions.status);
}

function activityTotals(
  period: Period,
  rows: Awaited<ReturnType<typeof activityGroups>>,
) {
  const statusCounts = {
    PENDING: 0,
    COMPLETED: 0,
    FAILED: 0,
    REVERSED: 0,
  } satisfies Record<(typeof transactionStatus.enumValues)[number], number>;
  const typeCounts = {
    DEPOSIT: 0,
    WITHDRAWAL: 0,
    FUND_TRANSFER: 0,
    LOAN_DISBURSEMENT: 0,
    LOAN_REPAYMENT: 0,
  } satisfies Record<(typeof transactionType.enumValues)[number], number>;
  const months = new Map(
    period.months.map((label) => [
      label,
      {
        month: label,
        completedTransactions: 0,
        DEPOSIT: 0n,
        WITHDRAWAL: 0n,
        FUND_TRANSFER: 0n,
        LOAN_DISBURSEMENT: 0n,
        LOAN_REPAYMENT: 0n,
        volume: 0n,
        spending: 0n,
      },
    ]),
  );
  const totals = { depositsPoisha: 0n, withdrawalsPoisha: 0n };

  for (const row of rows) {
    statusCounts[row.status] += row.count;
    if (row.status !== "COMPLETED") continue;
    const bucket = months.get(row.month)!;
    const amount = BigInt(row.amount);
    typeCounts[row.type] += row.count;
    bucket.completedTransactions += row.count;
    bucket[row.type] += amount;
    bucket.volume += amount;
    bucket.spending += BigInt(row.spending);
    if (row.type === "DEPOSIT") totals.depositsPoisha += amount;
    if (row.type === "WITHDRAWAL") totals.withdrawalsPoisha += amount;
  }

  return {
    summary: {
      completedTransactions: statusCounts.COMPLETED,
      depositsPoisha: totals.depositsPoisha.toString(),
      withdrawalsPoisha: totals.withdrawalsPoisha.toString(),
    },
    statusCounts,
    distribution: transactionType.enumValues.map((type) => ({
      type,
      count: typeCounts[type],
    })),
    monthly: [...months.values()],
  };
}

function accountTotals(db: ReportTransaction, scope?: CustomerScope) {
  return db
    .select({
      type: bankAccounts.type,
      count: count(),
      balance: sql<string>`sum(${bankAccounts.balancePoisha})::text`,
    })
    .from(bankAccounts)
    .where(
      scope
        ? and(
            eq(bankAccounts.customerId, scope.customerId),
            scope.accountId ? eq(bankAccounts.id, scope.accountId) : undefined,
          )
        : undefined,
    )
    .groupBy(bankAccounts.type);
}

function summarizeAccounts(rows: Awaited<ReturnType<typeof accountTotals>>) {
  return {
    accountCount: rows.reduce((total, row) => total + row.count, 0),
    balancePoisha: rows
      .reduce((total, row) => total + BigInt(row.balance), 0n)
      .toString(),
  };
}

async function loanQueue(db: ReportTransaction) {
  const [queue] = await db
    .select({
      pending:
        sql<number>`count(*) filter (where ${loans.status} = 'PENDING')`.mapWith(
          Number,
        ),
      underReview:
        sql<number>`count(*) filter (where ${loans.status} = 'UNDER_REVIEW' and ${loans.forwardedAt} is null)`.mapWith(
          Number,
        ),
      forwarded:
        sql<number>`count(*) filter (where ${loans.status} = 'UNDER_REVIEW' and ${loans.forwardedAt} is not null)`.mapWith(
          Number,
        ),
    })
    .from(loans)
    .where(inArray(loans.status, ["PENDING", "UNDER_REVIEW"]));
  return queue;
}

export function adminReport(period: Period) {
  return reportSnapshot(async (db) => {
    const accounts = await accountTotals(db);
    const customerCount = await db.$count(users, eq(users.role, "CUSTOMER"));
    const queue = await loanQueue(db);
    const openTransactionFlags = await db.$count(
      transactionFlags,
      isNull(transactionFlags.resolvedAt),
    );
    const [decisions] = await db
      .select({
        approved:
          sql<number>`count(*) filter (where ${loans.status} in ('APPROVED','ACTIVE','COMPLETED'))`.mapWith(
            Number,
          ),
        rejected:
          sql<number>`count(*) filter (where ${loans.status} = 'REJECTED')`.mapWith(
            Number,
          ),
      })
      .from(loans)
      .where(
        and(
          gte(loans.decidedAt, dhakaDayStart(period.from)),
          lt(loans.decidedAt, dhakaDayEnd(period.to)),
        ),
      );
    const activity = activityTotals(period, await activityGroups(db, period));
    return {
      period: { from: period.from, to: period.to, timeZone: period.timeZone },
      summary: {
        customerCount,
        ...summarizeAccounts(accounts),
        ...activity.summary,
        pendingLoanApplications:
          queue.pending + queue.underReview + queue.forwarded,
        openTransactionFlags,
      },
      loanQueue: queue,
      transactionStatusCounts: activity.statusCounts,
      accountDistribution: bankAccounts.type.enumValues.map((type) => ({
        type,
        count: accounts.find((row) => row.type === type)?.count ?? 0,
      })),
      loanDecisions: decisions,
      monthly: activity.monthly.map((row) => ({
        month: row.month,
        completedTransactions: row.completedTransactions,
        transactionVolumePoisha: row.volume.toString(),
        depositsPoisha: row.DEPOSIT.toString(),
        withdrawalsPoisha: row.WITHDRAWAL.toString(),
        transfersPoisha: row.FUND_TRANSFER.toString(),
        loanDisbursementsPoisha: row.LOAN_DISBURSEMENT.toString(),
        loanRepaymentsPoisha: row.LOAN_REPAYMENT.toString(),
      })),
    };
  });
}

function recentActivity(
  db: ReportTransaction,
  period: Period,
  scope: CustomerScope,
) {
  return db
    .select({
      reference: transactions.reference,
      type: transactions.type,
      status: transactions.status,
      description: transactions.description,
      amountPoisha: sql<string>`${transactions.amountPoisha}::text`,
      feePoisha: sql<string>`${transactions.feePoisha}::text`,
      createdAt: transactions.createdAt,
      direction: sql<"INTERNAL" | "OUTGOING" | "INCOMING">`case
      when ${sender.customerId} = ${scope.customerId} and ${receiver.customerId} = ${scope.customerId} then 'INTERNAL'
      when ${sender.customerId} = ${scope.customerId} then 'OUTGOING'
      else 'INCOMING' end`,
    })
    .from(transactions)
    .leftJoin(sender, eq(sender.id, transactions.senderAccountId))
    .leftJoin(receiver, eq(receiver.id, transactions.receiverAccountId))
    .where(and(activityRange(period), customerActivity(scope)))
    .orderBy(desc(transactions.createdAt), desc(transactions.reference))
    .limit(5);
}

function activeLoanTotals(db: ReportTransaction, scope: CustomerScope) {
  return db
    .select({
      activeLoans: count(),
      outstandingPrincipalPoisha: sql<string>`coalesce(sum(${loans.remainingPrincipalPoisha}), 0)::text`,
    })
    .from(loans)
    .where(
      and(
        eq(loans.customerId, scope.customerId),
        eq(loans.status, "ACTIVE"),
        scope.accountId
          ? eq(loans.disbursementAccountId, scope.accountId)
          : undefined,
      ),
    );
}

export function customerReport(
  userId: string,
  period: Period,
  accountId?: string,
) {
  return reportSnapshot(async (db) => {
    const [profile] = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId));
    const scope = profile && { customerId: profile.id, accountId };
    const accounts = scope ? await accountTotals(db, scope) : [];
    if (accountId && !accounts.length)
      throw new ApiError(404, "NOT_FOUND", "Bank account not found.");
    const [activeLoans] = scope
      ? await activeLoanTotals(db, scope)
      : [{ activeLoans: 0, outstandingPrincipalPoisha: "0" }];
    const activity = activityTotals(
      period,
      scope ? await activityGroups(db, period, scope) : [],
    );
    return {
      period: { from: period.from, to: period.to, timeZone: period.timeZone },
      accountId: accountId ?? null,
      summary: {
        ...summarizeAccounts(accounts),
        ...activity.summary,
        ...activeLoans,
      },
      transactionStatusCounts: activity.statusCounts,
      transactionDistribution: activity.distribution,
      recentTransactions: scope ? await recentActivity(db, period, scope) : [],
      monthly: activity.monthly.map((row) => ({
        month: row.month,
        spendingPoisha: row.spending.toString(),
        depositsPoisha: row.DEPOSIT.toString(),
      })),
    };
  });
}

export function staffReport(staffId: string) {
  return reportSnapshot(async (db) => {
    const [cash] = await db
      .select({
        deposits:
          sql<number>`count(*) filter (where ${cashRequests.type} = 'DEPOSIT')`.mapWith(
            Number,
          ),
        withdrawals:
          sql<number>`count(*) filter (where ${cashRequests.type} = 'WITHDRAWAL')`.mapWith(
            Number,
          ),
      })
      .from(cashRequests)
      .where(eq(cashRequests.status, "PENDING"));
    const queue = await loanQueue(db);
    const openTransactionFlags = await db.$count(
      transactionFlags,
      and(
        eq(transactionFlags.flaggedBy, staffId),
        isNull(transactionFlags.resolvedAt),
      ),
    );
    return {
      pendingCashRequests: { ...cash, total: cash.deposits + cash.withdrawals },
      loanReview: { ...queue, actionable: queue.pending + queue.underReview },
      openTransactionFlags,
    };
  });
}
