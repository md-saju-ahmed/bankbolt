import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  customerProfiles,
  managementEvents,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { hashCredential } from "../auth/credentials.ts";
import type { accountRequest, registration, review } from "./validation.ts";

type Reader = Pick<ReturnType<typeof getDatabase>, "select">;
type BankAccount = typeof bankAccounts.$inferSelect;

const missingCustomer = () =>
  new ApiError(404, "NOT_FOUND", "Customer not found.");

async function findCustomer(db: Reader, condition: SQL) {
  const [customer] = await db
    .select({
      id: customerProfiles.id,
      fullName: users.fullName,
      email: users.email,
      blocked: users.blocked,
      accessActive: users.accessActive,
      phone: customerProfiles.phone,
      dateOfBirth: customerProfiles.dateOfBirth,
      address: customerProfiles.address,
      identityReference: customerProfiles.identityReference,
      occupation: customerProfiles.occupation,
      photoUrl: customerProfiles.photoUrl,
      verificationStatus: customerProfiles.verificationStatus,
      verifiedBy: customerProfiles.verifiedBy,
      verifiedAt: customerProfiles.verifiedAt,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(and(eq(users.role, "CUSTOMER"), condition))
    .limit(1);
  if (!customer) throw missingCustomer();
  return customer;
}

export function findCustomerByEmail(email: string) {
  return findCustomer(getDatabase(), eq(users.email, email));
}

export function findCustomerById(customerId: string) {
  return findCustomer(getDatabase(), eq(customerProfiles.id, customerId));
}

export async function registerCustomer({
  password,
  fullName,
  email,
  ...profile
}: z.infer<typeof registration>) {
  const passwordHash = await hashCredential(password);

  return getDatabase().transaction(async (transaction) => {
    const [user] = await transaction
      .insert(users)
      .values({ fullName, email, passwordHash, role: "CUSTOMER" })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!user)
      throw new ApiError(
        409,
        "EMAIL_IN_USE",
        "This email address is already registered.",
      );

    const [customer] = await transaction
      .insert(customerProfiles)
      .values({ ...profile, userId: user.id })
      .onConflictDoNothing({ target: customerProfiles.identityReference })
      .returning({ id: customerProfiles.id });
    if (!customer)
      throw new ApiError(
        409,
        "IDENTITY_IN_USE",
        "This identity reference is already registered.",
      );

    return findCustomer(transaction, eq(customerProfiles.id, customer.id));
  });
}

export function recordVerification(
  customerId: string,
  status: z.infer<typeof review>["status"],
  reviewerId: string,
) {
  return getDatabase().transaction(async (transaction) => {
    const [updated] = await transaction
      .update(customerProfiles)
      .set({
        verificationStatus: status,
        verifiedBy: reviewerId,
        verifiedAt: sql`now()`,
      })
      .where(eq(customerProfiles.id, customerId))
      .returning({ id: customerProfiles.id });
    if (!updated) throw missingCustomer();

    return findCustomer(transaction, eq(customerProfiles.id, updated.id));
  });
}

export async function lockVerifiedCustomer(
  transaction: Reader,
  customerId: string,
) {
  // Verification changes and account writes serialize on the customer profile.
  const [customer] = await transaction
    .select({
      status: customerProfiles.verificationStatus,
      blocked: users.blocked,
      active: users.accessActive,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(and(eq(customerProfiles.id, customerId), eq(users.role, "CUSTOMER")))
    .for("update", { of: [customerProfiles, users] });

  if (!customer) throw missingCustomer();
  if (customer.blocked || !customer.active || customer.status !== "VERIFIED") {
    throw new ApiError(
      409,
      "CUSTOMER_NOT_ELIGIBLE",
      "The customer must be verified with active access.",
    );
  }
}

export function accountView(account: BankAccount) {
  return {
    id: account.id,
    accountNumber: account.accountNumber,
    type: account.type,
    status: account.status,
    balancePoisha: account.balancePoisha.toString(),
    heldBalancePoisha: account.heldBalancePoisha.toString(),
    availableBalancePoisha: (
      account.balancePoisha - account.heldBalancePoisha
    ).toString(),
    transferLimitPoisha: account.transferLimitPoisha.toString(),
    dailyTransferLimitPoisha: account.dailyTransferLimitPoisha.toString(),
    businessName: account.businessName,
    businessRegistrationReference: account.businessRegistrationReference,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    activatedAt: account.activatedAt,
  };
}

export async function listAccounts(customerId: string, page: number) {
  const db = getDatabase();
  await findCustomer(db, eq(customerProfiles.id, customerId));
  const pageSize = 20;
  const records = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.customerId, customerId))
    .orderBy(desc(bankAccounts.createdAt), desc(bankAccounts.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return {
    accounts: records.slice(0, pageSize).map(accountView),
    hasNextPage: records.length > pageSize,
  };
}

export function createAccount(
  customerId: string,
  input: z.infer<typeof accountRequest>,
  actorId: string,
) {
  return getDatabase().transaction(async (transaction) => {
    await lockVerifiedCustomer(transaction, customerId);
    const values = {
      customerId,
      creationKey: input.requestId,
      type: input.type,
      businessName: input.businessName ?? null,
      businessRegistrationReference:
        input.businessRegistrationReference ?? null,
    };
    const [existing] = await transaction
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.customerId, customerId),
          eq(bankAccounts.creationKey, input.requestId),
        ),
      );
    if (existing) {
      if (
        existing.type !== values.type ||
        existing.businessName !== values.businessName ||
        existing.businessRegistrationReference !==
          values.businessRegistrationReference
      ) {
        throw new ApiError(
          409,
          "REQUEST_ID_REUSED",
          "This request already created an account with different details.",
        );
      }
      return { account: accountView(existing), created: false };
    }
    const [account] = await transaction
      .insert(bankAccounts)
      .values(values)
      .returning();
    await transaction.insert(managementEvents).values({
      customerId,
      accountId: account.id,
      actorId,
      action: "ACCOUNT_OPENED",
    });
    return { account: accountView(account), created: true };
  });
}

export function activateAccount(
  customerId: string,
  accountId: string,
  actorId: string,
) {
  return getDatabase().transaction(async (transaction) => {
    await lockVerifiedCustomer(transaction, customerId);
    const ownerScope = and(
      eq(bankAccounts.id, accountId),
      eq(bankAccounts.customerId, customerId),
    );
    const [account] = await transaction
      .select()
      .from(bankAccounts)
      .where(ownerScope)
      .for("update");

    if (!account)
      throw new ApiError(404, "NOT_FOUND", "Bank account not found.");
    if (account.status === "ACTIVE") return accountView(account);
    if (account.status !== "PENDING") {
      throw new ApiError(
        409,
        "INVALID_ACCOUNT_STATUS",
        "Only pending accounts can be activated here.",
      );
    }

    const [activated] = await transaction
      .update(bankAccounts)
      .set({ status: "ACTIVE", activatedAt: sql`now()`, updatedAt: sql`now()` })
      .where(ownerScope)
      .returning();
    await transaction.insert(managementEvents).values({
      customerId,
      accountId,
      actorId,
      action: "ACCOUNT_ACTIVATED",
    });
    return accountView(activated);
  });
}
