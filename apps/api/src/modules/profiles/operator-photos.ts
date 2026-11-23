import { and, asc, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import { staffPhotoRequests, users } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { currentIdentity, requireRole } from "../auth/guards.ts";
import { requireAuthenticator } from "../auth/two-factor.ts";
import { externalPhotoUrl, pages } from "../onboarding/validation.ts";
import { profileDecision } from "./validation.ts";

const photoInput = z.strictObject({ photoUrl: externalPhotoUrl.nullable() });
const pageSize = 20;
const requestFields = {
  id: staffPhotoRequests.id,
  photoUrl: staffPhotoRequests.photoUrl,
  status: staffPhotoRequests.status,
  reviewReason: staffPhotoRequests.reviewReason,
};

export const operatorPhotosRouter = Router();

operatorPhotosRouter.get(
  "/",
  requireRole("STAFF", "ADMIN"),
  async (req, res) => {
    const { id, fullName, role, photoUrl } = currentIdentity(req);
    const [latest] =
      role === "STAFF"
        ? await getDatabase()
            .select(requestFields)
            .from(staffPhotoRequests)
            .where(eq(staffPhotoRequests.staffId, id))
            .orderBy(
              desc(staffPhotoRequests.createdAt),
              desc(staffPhotoRequests.id),
            )
            .limit(1)
        : [];
    res.json({ fullName, role, photoUrl, request: latest ?? null });
  },
);

operatorPhotosRouter.put(
  "/",
  requireRole("ADMIN"),
  requireWebOrigin,
  requireAuthenticator,
  async (req, res) => {
    const { photoUrl } = photoInput.parse(req.body);
    await getDatabase()
      .update(users)
      .set({ photoUrl })
      .where(
        and(eq(users.id, currentIdentity(req).id), eq(users.role, "ADMIN")),
      );
    res.status(204).end();
  },
);

operatorPhotosRouter.post(
  "/requests",
  requireRole("STAFF"),
  requireWebOrigin,
  requireAuthenticator,
  async (req, res) => {
    const { photoUrl } = photoInput.parse(req.body);
    const { id: staffId } = currentIdentity(req);
    const created = await getDatabase().transaction(async (tx) => {
      const [staff] = await tx
        .select({ photoUrl: users.photoUrl })
        .from(users)
        .where(and(eq(users.id, staffId), eq(users.role, "STAFF")))
        .for("update");
      if (!staff || staff.photoUrl === photoUrl)
        throw new ApiError(
          409,
          "PHOTO_UNCHANGED",
          "Choose a different profile picture.",
        );
      const [row] = await tx
        .insert(staffPhotoRequests)
        .values({ staffId, photoUrl })
        .onConflictDoNothing()
        .returning(requestFields);
      return row;
    });
    if (!created)
      throw new ApiError(
        409,
        "PHOTO_PENDING",
        "A profile picture request is already pending.",
      );
    res.status(201).json({ request: created });
  },
);

operatorPhotosRouter.get("/review", requireRole("ADMIN"), async (req, res) => {
  const { page } = pages.parse(req.query);
  const requests = await getDatabase()
    .select({
      ...requestFields,
      fullName: users.fullName,
      currentPhotoUrl: users.photoUrl,
      createdAt: staffPhotoRequests.createdAt,
    })
    .from(staffPhotoRequests)
    .innerJoin(users, eq(users.id, staffPhotoRequests.staffId))
    .where(eq(staffPhotoRequests.status, "PENDING"))
    .orderBy(asc(staffPhotoRequests.createdAt), asc(staffPhotoRequests.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  res.json({
    requests: requests.slice(0, pageSize),
    hasNextPage: requests.length > pageSize,
  });
});

operatorPhotosRouter.patch(
  "/review/:id",
  requireRole("ADMIN"),
  requireWebOrigin,
  requireAuthenticator,
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { status, reason } = profileDecision.parse(req.body);
    const reviewedBy = currentIdentity(req).id;
    await getDatabase().transaction(async (tx) => {
      const [target] = await tx
        .select({ staffId: staffPhotoRequests.staffId })
        .from(staffPhotoRequests)
        .where(eq(staffPhotoRequests.id, id));
      if (!target)
        throw new ApiError(404, "NOT_FOUND", "Photo request not found.");
      const [staff] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, target.staffId), eq(users.role, "STAFF")))
        .for("update");
      if (!staff || staff.id === reviewedBy)
        throw new ApiError(
          409,
          "PHOTO_REVIEW_UNAVAILABLE",
          "This request cannot be reviewed.",
        );
      const [decided] = await tx
        .update(staffPhotoRequests)
        .set({
          status,
          reviewedBy,
          reviewedAt: new Date(),
          reviewReason: reason,
        })
        .where(
          and(
            eq(staffPhotoRequests.id, id),
            eq(staffPhotoRequests.status, "PENDING"),
          ),
        )
        .returning({ photoUrl: staffPhotoRequests.photoUrl });
      if (!decided)
        throw new ApiError(
          409,
          "PHOTO_ALREADY_REVIEWED",
          "This request has already been reviewed.",
        );
      if (status === "APPROVED")
        await tx
          .update(users)
          .set({ photoUrl: decided.photoUrl })
          .where(eq(users.id, staff.id));
    });
    res.status(204).end();
  },
);
