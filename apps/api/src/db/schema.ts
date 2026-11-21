import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
