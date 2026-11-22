import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import { customerProfiles, users } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { releaseSuccessfulAttempt, reserveAttempt } from "./attempts.ts";
import { hashCredential, verifyCredential } from "./credentials.ts";

export const transactionPin = z.string().regex(/^[0-9]{6}$/);
export const pinChange = z.strictObject({
  password: z.string().min(1).max(128),
  currentPin: transactionPin.optional(),
  newPin: transactionPin,
});

export async function changeTransactionPin(
  userId: string,
  { password, currentPin, newPin }: z.infer<typeof pinChange>,
) {
  const window = await reserveAttempt("PIN", userId);
  const db = getDatabase();
  const [profile] = await db
    .select({
      id: customerProfiles.id,
      pinHash: customerProfiles.pinHash,
      passwordHash: users.passwordHash,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(eq(customerProfiles.userId, userId));

  const passwordMatches = await verifyCredential(
    password,
    profile?.passwordHash,
  );
  if (!profile || !passwordMatches) {
    throw new ApiError(
      403,
      "INVALID_CREDENTIALS",
      "The password is incorrect.",
    );
  }
  if (
    profile.pinHash &&
    !(await verifyCredential(currentPin ?? "", profile.pinHash))
  ) {
    throw new ApiError(
      403,
      "INVALID_PIN",
      "The current transaction PIN is incorrect.",
    );
  }

  const newHash = await hashCredential(newPin);
  await releaseSuccessfulAttempt("PIN", userId, window);
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        pinHash: customerProfiles.pinHash,
        blocked: users.blocked,
        active: users.accessActive,
      })
      .from(customerProfiles)
      .innerJoin(users, eq(users.id, customerProfiles.userId))
      .where(
        and(
          eq(customerProfiles.id, profile.id),
          eq(users.role, "CUSTOMER"),
          eq(users.passwordHash, profile.passwordHash),
        ),
      )
      .for("no key update", { of: [customerProfiles, users] });
    if (!current || current.blocked || !current.active) {
      throw new ApiError(
        403,
        "ACCOUNT_RESTRICTED",
        "This account's access is restricted.",
      );
    }
    if (current.pinHash !== profile.pinHash) {
      throw new ApiError(
        409,
        "PIN_CHANGED",
        "The transaction PIN changed. Please try again.",
      );
    }
    await tx
      .update(customerProfiles)
      .set({ pinHash: newHash })
      .where(eq(customerProfiles.id, profile.id));
  });
}
