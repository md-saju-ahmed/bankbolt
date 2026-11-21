import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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
    check(
      "bank_accounts_number_format",
      sql`${table.accountNumber} ~ '^[0-9]{12}$'`,
    ),
    check(
      "bank_accounts_nonnegative_balance",
      sql`${table.balancePoisha} >= 0`,
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
