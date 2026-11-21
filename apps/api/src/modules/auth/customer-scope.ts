import { and, eq } from "drizzle-orm";
import { getDatabase } from "../../db/client.ts";
import { customerProfiles } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { reserveAttempt } from "./attempts.ts";
import { verifyCredential } from "./credentials.ts";
import type { Identity } from "./sessions.ts";

export async function requireOwnedCustomerProfile(
  identity: Identity,
  profileId: string,
) {
  const [profile] = await getDatabase()
    .select({ id: customerProfiles.id })
    .from(customerProfiles)
    .where(
      and(
        eq(customerProfiles.id, profileId),
        eq(customerProfiles.userId, identity.id),
      ),
    );

  if (!profile || identity.role !== "CUSTOMER") {
    throw new ApiError(404, "NOT_FOUND", "Customer profile not found.");
  }
  return profile;
}

export async function verifyTransactionPin(identity: Identity, pin: string) {
  if (identity.role !== "CUSTOMER") {
    throw new ApiError(403, "FORBIDDEN", "A customer account is required.");
  }

  await reserveAttempt("PIN", identity.id);
  const [profile] = await getDatabase()
    .select({ pinHash: customerProfiles.pinHash })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, identity.id));

  if (!(await verifyCredential(pin, profile?.pinHash))) {
    throw new ApiError(403, "INVALID_PIN", "The transaction PIN is incorrect.");
  }
}
