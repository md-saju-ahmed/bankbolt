import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import {
  customerProfiles,
  managementEvents,
  profileChangeRequests,
  sessions,
  users,
} from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import type {
  profileChange,
  profileDecision,
  profileUpdate,
} from "./validation.ts";

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

const profileFields = {
  id: customerProfiles.id,
  fullName: users.fullName,
  email: users.email,
  phone: customerProfiles.phone,
  address: customerProfiles.address,
  photoUrl: customerProfiles.photoUrl,
  occupation: customerProfiles.occupation,
};

const requestFields = {
  id: profileChangeRequests.id,
  fullName: profileChangeRequests.fullName,
  email: profileChangeRequests.email,
  phone: profileChangeRequests.phone,
  address: profileChangeRequests.address,
  reason: profileChangeRequests.reason,
  status: profileChangeRequests.status,
  createdAt: profileChangeRequests.createdAt,
  reviewedAt: profileChangeRequests.reviewedAt,
  reviewReason: profileChangeRequests.reviewReason,
};

const missingProfile = () =>
  new ApiError(404, "NOT_FOUND", "Customer profile not found.");

const missingRequest = () =>
  new ApiError(404, "NOT_FOUND", "Profile change request not found.");

async function lockProfile(tx: Transaction, target: SQL) {
  const [profile] = await tx
    .select({
      ...profileFields,
      userId: users.id,
      blocked: users.blocked,
      active: users.accessActive,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(and(eq(users.role, "CUSTOMER"), target))
    .for("update", { of: [customerProfiles, users] });
  if (!profile) throw missingProfile();
  return profile;
}

function requireActiveProfile(profile: { blocked: boolean; active: boolean }) {
  if (profile.blocked || !profile.active)
    throw new ApiError(
      409,
      "PROFILE_ACCESS_RESTRICTED",
      "Restore customer access before changing their profile.",
    );
}

export async function recentProfileRequests(customerId: string) {
  return getDatabase()
    .select(requestFields)
    .from(profileChangeRequests)
    .where(eq(profileChangeRequests.customerId, customerId))
    .orderBy(
      desc(profileChangeRequests.createdAt),
      desc(profileChangeRequests.id),
    )
    .limit(5);
}

export async function ownProfile(userId: string) {
  const [profile] = await getDatabase()
    .select(profileFields)
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(eq(customerProfiles.userId, userId));
  if (!profile) throw missingProfile();
  return { profile, requests: await recentProfileRequests(profile.id) };
}

export async function updateProfile(
  target: SQL,
  actorId: string,
  input: z.infer<typeof profileUpdate>,
) {
  await getDatabase().transaction(async (tx) => {
    const profile = await lockProfile(tx, target);
    requireActiveProfile(profile);
    const changes = {
      occupation:
        input.occupation === profile.occupation ? undefined : input.occupation,
      photoUrl:
        input.photoUrl === profile.photoUrl ? undefined : input.photoUrl,
    };
    if (changes.occupation === undefined && changes.photoUrl === undefined)
      return;
    await tx
      .update(customerProfiles)
      .set(changes)
      .where(eq(customerProfiles.id, profile.id));
    await tx.insert(managementEvents).values({
      customerId: profile.id,
      actorId,
      action: "PROFILE_UPDATED",
    });
  });
}

export async function requestProfileChange(
  target: SQL,
  actorId: string,
  input: z.infer<typeof profileChange>,
) {
  return getDatabase().transaction(async (tx) => {
    const profile = await lockProfile(tx, target);
    requireActiveProfile(profile);
    const { fullName, email, phone, address } = input.changes;
    const changes = {
      fullName: fullName === profile.fullName ? undefined : fullName,
      email: email === profile.email ? undefined : email,
      phone: phone === profile.phone ? undefined : phone,
      address: address === profile.address ? undefined : address,
    };
    if (!Object.values(changes).some((value) => value !== undefined))
      throw new ApiError(
        400,
        "PROFILE_UNCHANGED",
        "Enter at least one changed detail.",
      );
    const [request] = await tx
      .insert(profileChangeRequests)
      .values({
        customerId: profile.id,
        submittedBy: actorId,
        reason: input.reason,
        ...changes,
      })
      .onConflictDoNothing()
      .returning(requestFields);
    if (!request)
      throw new ApiError(
        409,
        "PROFILE_CHANGE_PENDING",
        "This customer already has a pending profile change.",
      );
    await tx.insert(managementEvents).values({
      customerId: profile.id,
      actorId,
      action: "PROFILE_CHANGE_REQUESTED",
    });
    return request;
  });
}

export async function pendingProfileChanges(page: number, reviewerId: string) {
  const size = 20;
  const rows = await getDatabase()
    .select({
      ...requestFields,
      customerId: profileChangeRequests.customerId,
      customerName: users.fullName,
      submittedBy: profileChangeRequests.submittedBy,
    })
    .from(profileChangeRequests)
    .innerJoin(
      customerProfiles,
      eq(customerProfiles.id, profileChangeRequests.customerId),
    )
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(eq(profileChangeRequests.status, "PENDING"))
    .orderBy(profileChangeRequests.createdAt, profileChangeRequests.id)
    .limit(size + 1)
    .offset((page - 1) * size);

  return {
    requests: rows.slice(0, size).map(({ submittedBy, ...request }) => ({
      ...request,
      canReview: submittedBy !== reviewerId,
    })),
    hasNextPage: rows.length > size,
  };
}

function emailConflict(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "23505" &&
    "constraint" in cause &&
    cause.constraint === "users_email_unique"
  );
}

export async function decideProfileChange(
  id: string,
  reviewerId: string,
  input: z.infer<typeof profileDecision>,
) {
  try {
    await getDatabase().transaction(async (tx) => {
      const [target] = await tx
        .select({ customerId: profileChangeRequests.customerId })
        .from(profileChangeRequests)
        .where(eq(profileChangeRequests.id, id));
      if (!target) throw missingRequest();
      // Submission and review both lock the customer before changing the pending request.
      const profile = await lockProfile(
        tx,
        eq(customerProfiles.id, target.customerId),
      );
      const [request] = await tx
        .select()
        .from(profileChangeRequests)
        .where(eq(profileChangeRequests.id, id))
        .for("update");
      if (!request) throw missingRequest();
      if (request.status !== "PENDING")
        throw new ApiError(
          409,
          "PROFILE_CHANGE_DECIDED",
          "This request has already been reviewed.",
        );
      if (request.submittedBy === reviewerId)
        throw new ApiError(
          403,
          "PROFILE_SELF_REVIEW",
          "A different administrator must review this request.",
        );
      if (input.status === "APPROVED") {
        requireActiveProfile(profile);
        const emailChanged =
          request.email !== null && request.email !== profile.email;
        if (request.fullName !== null || emailChanged)
          await tx
            .update(users)
            .set({
              fullName: request.fullName ?? undefined,
              email: request.email ?? undefined,
            })
            .where(eq(users.id, profile.userId));
        if (request.phone !== null || request.address !== null)
          await tx
            .update(customerProfiles)
            .set({
              phone: request.phone ?? undefined,
              address: request.address ?? undefined,
            })
            .where(eq(customerProfiles.id, request.customerId));
        if (emailChanged)
          await tx.delete(sessions).where(eq(sessions.userId, profile.userId));
      }
      await tx
        .update(profileChangeRequests)
        .set({
          status: input.status,
          reviewedBy: reviewerId,
          reviewedAt: sql`now()`,
          reviewReason: input.reason,
        })
        .where(eq(profileChangeRequests.id, id));
      await tx.insert(managementEvents).values({
        customerId: request.customerId,
        actorId: reviewerId,
        action:
          input.status === "APPROVED"
            ? "PROFILE_CHANGE_APPROVED"
            : "PROFILE_CHANGE_REJECTED",
      });
    });
  } catch (error) {
    if (emailConflict(error))
      throw new ApiError(
        409,
        "EMAIL_IN_USE",
        "This email address is already registered.",
      );
    throw error;
  }
}
