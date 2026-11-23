import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { customerProfiles } from "../../db/schema.ts";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { requireAuthenticator } from "../auth/two-factor.ts";
import { pages } from "../onboarding/validation.ts";
import {
  decideProfileChange,
  ownProfile,
  pendingProfileChanges,
  requestProfileChange,
  updateProfile,
} from "./service.ts";
import { profileChange, profileDecision, profileUpdate } from "./validation.ts";

export const profilesRouter = Router();
profilesRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
profilesRouter.use(requireAuth);

profilesRouter.get("/", requireRole("CUSTOMER"), async (req, res) => {
  res.json(await ownProfile(currentIdentity(req).id));
});
profilesRouter.patch(
  "/",
  requireRole("CUSTOMER"),
  requireWebOrigin,
  async (req, res) => {
    const { id } = currentIdentity(req);
    await updateProfile(
      eq(customerProfiles.userId, id),
      id,
      profileUpdate.parse(req.body),
    );
    res.status(204).end();
  },
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
  requireAuthenticator,
  async (req, res) => {
    const target = eq(
      customerProfiles.id,
      z.uuid().parse(req.params.customerId),
    );
    await updateProfile(
      target,
      currentIdentity(req).id,
      profileUpdate.parse(req.body),
    );
    res.status(204).end();
  },
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

profilesRouter.get("/review", requireRole("ADMIN"), async (req, res) => {
  res.json(
    await pendingProfileChanges(
      pages.parse(req.query).page,
      currentIdentity(req).id,
    ),
  );
});
profilesRouter.patch(
  "/review/:requestId",
  requireRole("ADMIN"),
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
