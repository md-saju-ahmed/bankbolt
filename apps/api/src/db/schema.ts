import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { annualLoanRateBps, loanTypes } from "../modules/loans/catalog.ts";

export const userRole = pgEnum("user_role", ["ADMIN", "STAFF", "CUSTOMER"]);
export const verificationStatus = pgEnum("verification_status", [
  "PENDING",
  "VERIFIED",
  "REJECTED",
]);
export const attemptPurpose = pgEnum("attempt_purpose", ["LOGIN", "PIN"]);

export const users = pgTable(
  "users",
  {
    id: uuid().defaultRandom().primaryKey(),
    email: text().notNull().unique(),
    fullName: text("full_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole().notNull(),
    blocked: boolean().notNull().default(false),
    accessActive: boolean("access_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "users_email_normalized",
      sql`${table.email} = lower(trim(${table.email}))`,
    ),
  ],
);

export const customerProfiles = pgTable("customer_profiles", {
  id: uuid().defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  phone: text().notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  address: text().notNull(),
  identityReference: text("identity_reference").notNull().unique(),
  occupation: text(),
  verificationStatus: verificationStatus("verification_status")
    .notNull()
    .default("PENDING"),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  pinHash: text("pin_hash"),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenDigest: text("token_digest").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const authAttempts = pgTable(
  "auth_attempts",
  {
    purpose: attemptPurpose().notNull(),
    subject: text().notNull(),
    attempts: integer().notNull(),
    resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.purpose, table.subject] })],
);

export const accountType = pgEnum("account_type", [
  "SAVINGS",
  "CURRENT",
  "BUSINESS",
]);
export const accountStatus = pgEnum("account_status", [
  "PENDING",
  "ACTIVE",
  "FROZEN",
  "DEACTIVATED",
]);
export const bankAccountNumberSequence = pgSequence("bank_account_number_seq", {
  startWith: 100_000_000_000,
  minValue: 100_000_000_000,
  maxValue: 999_999_999_999,
});

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid().defaultRandom().primaryKey(),
    accountNumber: text("account_number")
      .notNull()
      .unique()
      .default(sql`nextval('public.bank_account_number_seq')::text`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerProfiles.id),
    creationKey: uuid("creation_key").notNull(),
    type: accountType().notNull(),
    status: accountStatus().notNull().default("PENDING"),
    balancePoisha: bigint("balance_poisha", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    heldBalancePoisha: bigint("held_balance_poisha", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    transferLimitPoisha: bigint("transfer_limit_poisha", { mode: "bigint" })
      .notNull()
      .default(sql`5000000`),
    dailyTransferLimitPoisha: bigint("daily_transfer_limit_poisha", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`20000000`),
    businessName: text("business_name"),
    businessRegistrationReference: text("business_registration_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [
    unique("bank_accounts_customer_creation_key").on(
      table.customerId,
      table.creationKey,
    ),
    unique("bank_accounts_id_customer_unique").on(table.id, table.customerId),
    check(
      "bank_accounts_number_format",
      sql`${table.accountNumber} ~ '^[0-9]{12}$'`,
    ),
    check(
      "bank_accounts_nonnegative_balance",
      sql`${table.balancePoisha} >= 0`,
    ),
    check(
      "bank_accounts_valid_hold",
      sql`${table.heldBalancePoisha} between 0 and ${table.balancePoisha}`,
    ),
    check(
      "bank_accounts_nonnegative_limits",
      sql`${table.transferLimitPoisha} >= 0 AND ${table.dailyTransferLimitPoisha} >= 0`,
    ),
    check(
      "bank_accounts_business_metadata",
      sql`${table.type} = 'BUSINESS' OR (${table.businessName} IS NULL AND ${table.businessRegistrationReference} IS NULL)`,
    ),
  ],
);

export const managementAction = pgEnum("management_action", [
  "CUSTOMER_ACTIVATED",
  "CUSTOMER_DEACTIVATED",
  "CUSTOMER_BLOCKED",
  "ACCOUNT_OPENED",
  "ACCOUNT_ACTIVATED",
  "ACCOUNT_FROZEN",
  "ACCOUNT_UNFROZEN",
  "ACCOUNT_DEACTIVATED",
  "ACCOUNT_REACTIVATED",
  "ACCOUNT_METADATA_UPDATED",
  "ACCOUNT_LIMITS_UPDATED",
]);

export const managementEvents = pgTable(
  "management_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerProfiles.id),
    accountId: uuid("account_id").references(() => bankAccounts.id),
    actorId: uuid("actor_id").references(() => users.id),
    action: managementAction().notNull(),
    reason: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("management_events_customer_time_idx").on(
      table.customerId,
      table.createdAt,
    ),
    index("management_events_account_time_idx").on(
      table.accountId,
      table.createdAt,
    ),
  ],
);

export const cashRequestType = pgEnum("cash_request_type", [
  "DEPOSIT",
  "WITHDRAWAL",
]);
export const cashRequestStatus = pgEnum("cash_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export const cashRequests = pgTable(
  "cash_requests",
  {
    id: uuid().defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => bankAccounts.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerProfiles.id),
    type: cashRequestType().notNull(),
    status: cashRequestStatus().notNull().default("PENDING"),
    amountPoisha: bigint("amount_minor", { mode: "bigint" }).notNull(),
    description: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    fundsReserved: boolean("funds_reserved").notNull().default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    index("cash_requests_customer_time_idx").on(
      table.customerId,
      table.createdAt,
    ),
    index("cash_requests_status_time_idx").on(table.status, table.createdAt),
    check(
      "cash_requests_valid_reservation",
      sql`not ${table.fundsReserved} or (${table.type} = 'WITHDRAWAL' and ${table.status} = 'PENDING')`,
    ),
    check(
      "cash_requests_cancellation_time",
      sql`(${table.status}::text = 'CANCELLED') = (${table.cancelledAt} is not null)`,
    ),
    check("cash_requests_positive_amount", sql`${table.amountPoisha} > 0`),
    check(
      "cash_requests_review_fields",
      sql`case
      when ${table.status}::text in ('PENDING', 'CANCELLED') then
        ${table.reviewedBy} is null and ${table.reviewedAt} is null and ${table.rejectionReason} is null
      when ${table.status} = 'APPROVED' then
        ${table.reviewedBy} is not null and ${table.reviewedAt} is not null and ${table.rejectionReason} is null
      else ${table.reviewedBy} is not null and ${table.reviewedAt} is not null
        and ${table.rejectionReason} is not null and length(trim(${table.rejectionReason})) > 0
      end`,
    ),
  ],
);

export const loanType = pgEnum("loan_type", loanTypes);
export const loanStatus = pgEnum("loan_status", [
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "ACTIVE",
  "COMPLETED",
]);

export const loans = pgTable(
  "loans",
  {
    id: uuid().defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerProfiles.id),
    disbursementAccountId: uuid("disbursement_account_id").notNull(),
    type: loanType().notNull(),
    status: loanStatus().notNull().default("PENDING"),
    requestedPrincipalPoisha: bigint("requested_principal_minor", {
      mode: "bigint",
    }).notNull(),
    approvedPrincipalPoisha: bigint("approved_principal_minor", {
      mode: "bigint",
    }),
    remainingPrincipalPoisha: bigint("remaining_principal_minor", {
      mode: "bigint",
    }),
    annualRateBps: integer("annual_rate_bps")
      .notNull()
      .default(annualLoanRateBps),
    termMonths: integer("term_months").notNull(),
    monthlyIncomePoisha: bigint("monthly_income_minor", {
      mode: "bigint",
    }).notNull(),
    employmentStatus: text("employment_status").notNull(),
    description: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
    reviewStartedBy: uuid("review_started_by").references(() => users.id),
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    forwardedBy: uuid("forwarded_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.id),
    approvalReason: text("approval_reason"),
    rejectionReason: text("rejection_reason"),
    disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.disbursementAccountId, table.customerId],
      foreignColumns: [bankAccounts.id, bankAccounts.customerId],
      name: "loans_owned_disbursement_account_fk",
    }),
    index("loans_customer_time_idx").on(table.customerId, table.createdAt),
    index("loans_status_time_idx").on(table.status, table.createdAt),
    check(
      "loans_baseline_terms",
      sql`${table.requestedPrincipalPoisha} > 0
    and ${table.monthlyIncomePoisha} >= 0 and ${table.termMonths} between 6 and 60
    and ${table.annualRateBps} = ${sql.raw(String(annualLoanRateBps))}`,
    ),
    check(
      "loans_review_fields",
      sql`(${table.forwardedAt} is null) = (${table.forwardedBy} is null)
    and (${table.reviewStartedBy} is null or ${table.reviewStartedAt} is not null)
    and (${table.status} <> 'PENDING' or (${table.reviewStartedAt} is null and ${table.forwardedAt} is null))`,
    ),
    check(
      "loans_decision_fields",
      sql`case
    when ${table.status} in ('PENDING', 'UNDER_REVIEW') then
      ${table.decidedAt} is null and ${table.decidedBy} is null and ${table.approvedPrincipalPoisha} is null and ${table.rejectionReason} is null
    when ${table.status} = 'REJECTED' then
      ${table.decidedAt} is not null and ${table.decidedBy} is not null and ${table.approvedPrincipalPoisha} is null
      and ${table.rejectionReason} is not null and length(trim(${table.rejectionReason})) > 0
    else ${table.decidedAt} is not null and ${table.decidedBy} is not null and ${table.rejectionReason} is null
      and ${table.approvedPrincipalPoisha} is not null and ${table.approvedPrincipalPoisha} > 0
  end`,
    ),
    check(
      "loans_approval_reason",
      sql`${table.approvalReason} is null or (${table.status} in ('APPROVED', 'ACTIVE', 'COMPLETED') and length(trim(${table.approvalReason})) > 0)`,
    ),
    check(
      "loans_disbursement_fields",
      sql`case
    when ${table.status} = 'ACTIVE' then ${table.disbursedAt} is not null and ${table.completedAt} is null
      and ${table.remainingPrincipalPoisha} is not null and ${table.remainingPrincipalPoisha} > 0
      and ${table.remainingPrincipalPoisha} <= ${table.approvedPrincipalPoisha}
    when ${table.status} = 'COMPLETED' then ${table.disbursedAt} is not null and ${table.completedAt} is not null
      and ${table.remainingPrincipalPoisha} is not null and ${table.remainingPrincipalPoisha} = 0
    else ${table.disbursedAt} is null and ${table.completedAt} is null and ${table.remainingPrincipalPoisha} is null
  end`,
    ),
  ],
);

export const loanReviewNotes = pgTable(
  "loan_review_notes",
  {
    id: uuid().defaultRandom().primaryKey(),
    loanId: uuid("loan_id")
      .notNull()
      .references(() => loans.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    note: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("loan_review_notes_loan_time_idx").on(table.loanId, table.createdAt),
    check(
      "loan_review_notes_note_required",
      sql`length(trim(${table.note})) > 0`,
    ),
  ],
);

export const transactionType = pgEnum("transaction_type", [
  "DEPOSIT",
  "WITHDRAWAL",
  "FUND_TRANSFER",
  "TRANSFER_REVERSAL",
  "LOAN_DISBURSEMENT",
  "LOAN_REPAYMENT",
]);
export const transactionStatus = pgEnum("transaction_status", [
  "PENDING",
  "COMPLETED",
  "FAILED",
  "REVERSED",
]);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid().defaultRandom().primaryKey(),
    reference: uuid().defaultRandom().notNull().unique(),
    senderAccountId: uuid("sender_account_id").references(
      () => bankAccounts.id,
    ),
    receiverAccountId: uuid("receiver_account_id").references(
      () => bankAccounts.id,
    ),
    type: transactionType().notNull(),
    status: transactionStatus().notNull(),
    amountPoisha: bigint("amount_minor", { mode: "bigint" }).notNull(),
    feePoisha: bigint("fee_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    description: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    initiatedBy: uuid("initiated_by").references(() => users.id),
    idempotencyKey: uuid("idempotency_key"),
    reversesTransactionId: uuid("reverses_transaction_id"),
    reversalReason: text("reversal_reason"),
    refundedFeePoisha: bigint("refunded_fee_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    cashRequestId: uuid("cash_request_id").references(() => cashRequests.id),
    loanId: uuid("loan_id").references(() => loans.id),
  },
  (table) => [
    foreignKey({
      columns: [table.reversesTransactionId],
      foreignColumns: [table.id],
      name: "transactions_reversal_fk",
    }),
    unique("transactions_reversal_unique").on(table.reversesTransactionId),
    check(
      "transactions_reversal_fields",
      sql`case
      when ${table.type}::text = 'TRANSFER_REVERSAL' then
        ${table.reversesTransactionId} is not null and ${table.reversesTransactionId} <> ${table.id}
        and ${table.initiatedBy} is not null and ${table.status} = 'COMPLETED'
        and ${table.reversalReason} is not null and length(trim(${table.reversalReason})) between 1 and 300
        and ${table.refundedFeePoisha} >= 0 and ${table.feePoisha} = 0
        and ${table.idempotencyKey} is null
      else ${table.reversesTransactionId} is null and ${table.reversalReason} is null and ${table.refundedFeePoisha} = 0
      end`,
    ),
    unique("transactions_cash_request_unique").on(table.cashRequestId),
    unique("transactions_id_loan_unique").on(table.id, table.loanId),
    uniqueIndex("transactions_loan_disbursement_unique")
      .on(table.loanId)
      .where(sql`${table.type} = 'LOAN_DISBURSEMENT'`),
    unique("transactions_initiator_idempotency_key").on(
      table.initiatedBy,
      table.idempotencyKey,
    ),
    index("transactions_sender_time_idx").on(
      table.senderAccountId,
      table.createdAt,
    ),
    index("transactions_receiver_time_idx").on(
      table.receiverAccountId,
      table.createdAt,
    ),
    check("transactions_positive_amount", sql`${table.amountPoisha} > 0`),
    check("transactions_nonnegative_fee", sql`${table.feePoisha} >= 0`),
    check(
      "transactions_loan_type",
      sql`${table.loanId} is null or ${table.type} in ('LOAN_DISBURSEMENT', 'LOAN_REPAYMENT')`,
    ),
    check(
      "transactions_cash_request_type",
      sql`${table.cashRequestId} is null or ${table.type} in ('DEPOSIT', 'WITHDRAWAL')`,
    ),
    check(
      "transactions_account_direction",
      sql`case
        when ${table.type}::text in ('FUND_TRANSFER', 'TRANSFER_REVERSAL') then
          ${table.senderAccountId} is not null and ${table.receiverAccountId} is not null
          and ${table.senderAccountId} <> ${table.receiverAccountId}
        when ${table.type} in ('DEPOSIT', 'LOAN_DISBURSEMENT')
          then ${table.senderAccountId} is null and ${table.receiverAccountId} is not null
        else ${table.senderAccountId} is not null and ${table.receiverAccountId} is null
      end`,
    ),
    check(
      "transactions_transfer_identity",
      sql`(${table.idempotencyKey} is null or ${table.initiatedBy} is not null)
        and (${table.type} <> 'FUND_TRANSFER' or ${table.idempotencyKey} is not null)`,
    ),
  ],
);

export const loanInstallments = pgTable(
  "loan_installments",
  {
    id: uuid().defaultRandom().primaryKey(),
    loanId: uuid("loan_id")
      .notNull()
      .references(() => loans.id),
    number: integer("installment_number").notNull(),
    dueDate: date("due_date").notNull(),
    principalPoisha: bigint("principal_minor", { mode: "bigint" }).notNull(),
    interestPoisha: bigint("interest_minor", { mode: "bigint" }).notNull(),
    paidAmountPoisha: bigint("paid_amount_minor", { mode: "bigint" }),
    paidOverdueInterestPoisha: bigint("paid_overdue_interest_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    repaymentTransactionId: uuid("repayment_transaction_id").unique(),
  },
  (table) => [
    foreignKey({
      columns: [table.repaymentTransactionId, table.loanId],
      foreignColumns: [transactions.id, transactions.loanId],
      name: "loan_installments_repayment_loan_fk",
    }),
    unique("loan_installments_loan_number_unique").on(
      table.loanId,
      table.number,
    ),
    check(
      "loan_installments_schedule_fields",
      sql`${table.number} > 0 and ${table.principalPoisha} > 0 and ${table.interestPoisha} >= 0`,
    ),
    check(
      "loan_installments_payment_fields",
      sql`(
    ${table.paidAt} is null and ${table.paidAmountPoisha} is null and ${table.repaymentTransactionId} is null and ${table.paidOverdueInterestPoisha} = 0
  ) or (
    ${table.paidAt} is not null and ${table.paidAmountPoisha} is not null and ${table.repaymentTransactionId} is not null
    and ${table.paidOverdueInterestPoisha} >= 0
    and ${table.paidAmountPoisha} = ${table.principalPoisha} + ${table.interestPoisha} + ${table.paidOverdueInterestPoisha}
  )`,
    ),
  ],
);

export const transactionFlags = pgTable(
  "transaction_flags",
  {
    id: uuid().defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    flaggedBy: uuid("flagged_by")
      .notNull()
      .references(() => users.id),
    reason: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
  },
  (table) => [
    uniqueIndex("transaction_flags_open_transaction_unique")
      .on(table.transactionId)
      .where(sql`${table.resolvedAt} is null`),
    index("transaction_flags_transaction_time_idx").on(
      table.transactionId,
      table.createdAt,
    ),
    index("transaction_flags_created_idx").on(table.createdAt, table.id),
    check(
      "transaction_flags_reason_required",
      sql`length(trim(${table.reason})) > 0`,
    ),
    check(
      "transaction_flags_resolution_fields",
      sql`(
      ${table.resolvedAt} is null and ${table.resolvedBy} is null and ${table.resolutionNote} is null
    ) or (${table.resolvedAt} is not null and ${table.resolvedBy} is not null)`,
    ),
  ],
);
