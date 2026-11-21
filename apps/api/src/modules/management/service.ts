import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  bankAccounts,
  customerProfiles,
  managementEvents,
  sessions,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import {
  accountView,
  findCustomerById,
  lockVerifiedCustomer,
} from "../onboarding/service.ts";
import type {
  accountSearch,
  accountUpdate,
  customerSearch,
  accessUpdate,
} from "./validation.ts";

const pageSize = 20;
const contains = (term: string) => `%${term.replace(/[\\%_]/g, "\\$&")}%`;
const access = sql<
  "ACTIVE" | "INACTIVE" | "BLOCKED"
>`case when ${users.blocked} then 'BLOCKED' when ${users.accessActive} then 'ACTIVE' else 'INACTIVE' end`;

export async function searchCustomers({
  q,
  page,
  verification,
  accessStatus,
}: z.infer<typeof customerSearch>) {
  const term = contains(q);
  const rows = await getDatabase()
    .select({
      id: customerProfiles.id,
      fullName: users.fullName,
      email: users.email,
      verificationStatus: customerProfiles.verificationStatus,
      accessStatus: access,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(
      and(
        eq(users.role, "CUSTOMER"),
        q
          ? or(
              ilike(users.fullName, term),
              ilike(users.email, term),
              ilike(customerProfiles.identityReference, term),
            )
          : undefined,
        verification
          ? eq(customerProfiles.verificationStatus, verification)
          : undefined,
        accessStatus ? sql`${access} = ${accessStatus}` : undefined,
      ),
    )
    .orderBy(desc(users.createdAt), desc(customerProfiles.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return {
    customers: rows.slice(0, pageSize),
    hasNextPage: rows.length > pageSize,
  };
}

export async function searchAccounts({
  q,
  page,
  type,
  status,
}: z.infer<typeof accountSearch>) {
  const term = contains(q);
  const rows = await getDatabase()
    .select({
      account: bankAccounts,
      ownerName: users.fullName,
    })
    .from(bankAccounts)
    .innerJoin(
      customerProfiles,
      eq(customerProfiles.id, bankAccounts.customerId),
    )
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(
      and(
        q
          ? or(
              ilike(bankAccounts.accountNumber, term),
              ilike(users.fullName, term),
              ilike(users.email, term),
            )
          : undefined,
        type ? eq(bankAccounts.type, type) : undefined,
        status ? eq(bankAccounts.status, status) : undefined,
      ),
    )
    .orderBy(desc(bankAccounts.createdAt), desc(bankAccounts.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return {
    accounts: rows.slice(0, pageSize).map(({ account, ownerName }) => ({
      ...accountView(account),
      ownerName,
    })),
    hasNextPage: rows.length > pageSize,
  };
}

async function activity(
  customerId: string,
  page: number,
  accountId?: string,
  admin = false,
) {
  const rows = await getDatabase()
    .select({
      id: managementEvents.id,
      action: managementEvents.action,
      reason: managementEvents.reason,
      actorName: users.fullName,
      createdAt: managementEvents.createdAt,
      accountNumber: bankAccounts.accountNumber,
    })
    .from(managementEvents)
    .leftJoin(users, eq(users.id, managementEvents.actorId))
    .leftJoin(bankAccounts, eq(bankAccounts.id, managementEvents.accountId))
    .where(
      and(
        eq(managementEvents.customerId, customerId),
        accountId ? eq(managementEvents.accountId, accountId) : undefined,
        admin ? undefined : isNotNull(managementEvents.accountId),
      ),
    )
    .orderBy(desc(managementEvents.createdAt), desc(managementEvents.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return {
    events: rows.slice(0, pageSize),
    hasNextPage: rows.length > pageSize,
  };
}

export async function customerDetails(
  customerId: string,
  page: number,
  admin: boolean,
) {
  const customer = await findCustomerById(customerId);
  return {
    customer,
    history: await activity(customerId, page, undefined, admin),
  };
}

const missingAccount = () =>
  new ApiError(404, "NOT_FOUND", "Bank account not found.");

export async function accountDetails(accountId: string, page: number) {
  const [row] = await getDatabase()
    .select({
      account: bankAccounts,
      ownerName: users.fullName,
      ownerEmail: users.email,
    })
    .from(bankAccounts)
    .innerJoin(
      customerProfiles,
      eq(customerProfiles.id, bankAccounts.customerId),
    )
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(eq(bankAccounts.id, accountId));
  if (!row) throw missingAccount();
  const { account, ownerName, ownerEmail } = row;
  return {
    account: {
      ...accountView(account),
      ownerName,
      ownerEmail,
      customerId: account.customerId,
    },
    history: await activity(account.customerId, page, accountId),
  };
}

const accessChanges = {
  ACTIVATE: {
    blocked: false,
    accessActive: true,
    action: "CUSTOMER_ACTIVATED",
  },
  DEACTIVATE: {
    blocked: false,
    accessActive: false,
    action: "CUSTOMER_DEACTIVATED",
  },
  BLOCK: { blocked: true, accessActive: false, action: "CUSTOMER_BLOCKED" },
} as const;

export async function changeAccess(
  customerId: string,
  input: z.infer<typeof accessUpdate>,
  actorId: string,
) {
  const { blocked, accessActive, action } = accessChanges[input.action];
  await getDatabase().transaction(async (tx) => {
    const [owner] = await tx
      .select({
        id: users.id,
        blocked: users.blocked,
        active: users.accessActive,
      })
      .from(users)
      .innerJoin(customerProfiles, eq(customerProfiles.userId, users.id))
      .where(
        and(eq(customerProfiles.id, customerId), eq(users.role, "CUSTOMER")),
      )
      .for("update", { of: users });
    if (!owner) throw new ApiError(404, "NOT_FOUND", "Customer not found.");
    if (owner.blocked === blocked && owner.active === accessActive) return;
    if (owner.blocked && input.action === "DEACTIVATE") {
      throw new ApiError(
        409,
        "INVALID_CUSTOMER_STATUS",
        "Restore this blocked customer's access before deactivating it.",
      );
    }
    await tx
      .update(users)
      .set({ blocked, accessActive })
      .where(eq(users.id, owner.id));
    await tx.delete(sessions).where(eq(sessions.userId, owner.id));
    await tx
      .insert(managementEvents)
      .values({ customerId, actorId, action, reason: input.reason });
  });
}

const transitions = {
  FREEZE: { from: "ACTIVE", to: "FROZEN", action: "ACCOUNT_FROZEN" },
  UNFREEZE: { from: "FROZEN", to: "ACTIVE", action: "ACCOUNT_UNFROZEN" },
  DEACTIVATE: {
    from: "ACTIVE",
    to: "DEACTIVATED",
    action: "ACCOUNT_DEACTIVATED",
  },
  REACTIVATE: {
    from: "DEACTIVATED",
    to: "ACTIVE",
    action: "ACCOUNT_REACTIVATED",
  },
} as const;

export async function updateAccount(
  accountId: string,
  input: z.infer<typeof accountUpdate>,
  actorId: string,
) {
  await getDatabase().transaction(async (tx) => {
    if (input.kind === "status" && transitions[input.action].to === "ACTIVE") {
      // Keep the same lock order as onboarding: customer and user before account.
      const [owner] = await tx
        .select({ customerId: bankAccounts.customerId })
        .from(bankAccounts)
        .where(eq(bankAccounts.id, accountId));
      if (!owner) throw missingAccount();
      await lockVerifiedCustomer(tx, owner.customerId);
    }
    const [account] = await tx
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, accountId))
      .for("update");
    if (!account) throw missingAccount();

    let changes: Partial<typeof bankAccounts.$inferInsert>;
    let action: typeof managementEvents.$inferInsert.action;
    if (input.kind === "status") {
      const step = transitions[input.action];
      if (account.status === step.to) return;
      if (account.status !== step.from) {
        throw new ApiError(
          409,
          "INVALID_TRANSITION",
          "This account's current status does not allow that action.",
        );
      }
      changes = { status: step.to };
      action = step.action;
    } else if (input.kind === "limits") {
      if (
        account.transferLimitPoisha === input.transferLimitPoisha &&
        account.dailyTransferLimitPoisha === input.dailyTransferLimitPoisha
      )
        return;
      changes = {
        transferLimitPoisha: input.transferLimitPoisha,
        dailyTransferLimitPoisha: input.dailyTransferLimitPoisha,
      };
      action = "ACCOUNT_LIMITS_UPDATED";
    } else {
      if (account.type !== "BUSINESS")
        throw new ApiError(
          409,
          "BUSINESS_ACCOUNT_REQUIRED",
          "Business details can only be edited on Business accounts.",
        );
      if (
        account.businessName === input.businessName &&
        account.businessRegistrationReference ===
          input.businessRegistrationReference
      )
        return;
      changes = {
        businessName: input.businessName,
        businessRegistrationReference: input.businessRegistrationReference,
      };
      action = "ACCOUNT_METADATA_UPDATED";
    }
    await tx
      .update(bankAccounts)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(eq(bankAccounts.id, accountId));
    await tx.insert(managementEvents).values({
      customerId: account.customerId,
      accountId,
      actorId,
      action,
      reason: input.reason,
    });
  });
}
