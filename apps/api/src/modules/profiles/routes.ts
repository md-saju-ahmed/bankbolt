import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { customerProfiles } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { requireAuthenticator } from "../auth/two-factor.ts";
import { pages } from "../onboarding/validation.ts";
import {
  decideProfileChange,
  ownProfile,
  pendingProfileChanges,
  requestProfileChange,
} from "./service.ts";
import { operatorPhotosRouter } from "./operator-photos.ts";
import { profileChange, profileDecision } from "./validation.ts";

function reviewRequired() {
  throw new ApiError(
    409,
    "PROFILE_REVIEW_REQUIRED",
    "Submit the profile change for review.",
  );
}

export const profilesRouter = Router();
profilesRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
profilesRouter.use(requireAuth);
profilesRouter.use("/operator-photo", operatorPhotosRouter);

profilesRouter.get("/", requireRole("CUSTOMER"), async (req, res) => {
  res.json(await ownProfile(currentIdentity(req).id));
});
profilesRouter.patch(
  "/",
  requireRole("CUSTOMER"),
  requireWebOrigin,
  reviewRequired,
);
profilesRouter.post(
  "/requests",
  requireRole("CUSTOMER"),
  requireWebOrigin,
  requireAuthenticator,
  async (req, res) => {
    const { id } = currentIdentity(req);
    const request = await requestProfileChange(
      eq(customerProfiles.userId, id),
      id,
      profileChange.parse(req.body),
    );
    res.status(201).json({ request });
  },
);

profilesRouter.patch(
  "/customers/:customerId",
  requireRole("STAFF", "ADMIN"),
  requireWebOrigin,
  reviewRequired,
);
profilesRouter.post(
  "/customers/:customerId/requests",
  requireRole("STAFF", "ADMIN"),
  requireWebOrigin,
  requireAuthenticator,
  async (req, res) => {
    const target = eq(
      customerProfiles.id,
      z.uuid().parse(req.params.customerId),
    );
    const request = await requestProfileChange(
      target,
      currentIdentity(req).id,
      profileChange.parse(req.body),
    );
    res.status(201).json({ request });
  },
);

profilesRouter.get(
  "/review",
  requireRole("STAFF", "ADMIN"),
  async (req, res) => {
    res.json(
      await pendingProfileChanges(
        pages.parse(req.query).page,
        currentIdentity(req).id,
      ),
    );
  },
);
profilesRouter.patch(
  "/review/:requestId",
  requireRole("STAFF", "ADMIN"),
  requireWebOrigin,
  requireAuthenticator,
  async (req, res) => {
    await decideProfileChange(
      z.uuid().parse(req.params.requestId),
      currentIdentity(req).id,
      profileDecision.parse(req.body),
    );
    res.status(204).end();
  },
);
