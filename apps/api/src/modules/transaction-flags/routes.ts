import { Router } from "express";
import { z } from "zod";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { pages } from "../onboarding/validation.ts";
import {
  flagTransaction,
  listTransactionFlags,
  resolveFlag,
} from "./service.ts";

const note = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((value) => !value.includes("\0"));
const flagInput = z.strictObject({ reason: note });
const resolutionInput = z.strictObject({ note: note.optional() }).default({});
const queueFilters = pages.extend({
  status: z.enum(["OPEN", "RESOLVED"]).optional(),
});
const referenceParam = z.strictObject({ reference: z.uuid() });

export const relatedFlagsRouter = Router({ mergeParams: true });
relatedFlagsRouter.get(
  "/flags",
  requireRole("STAFF", "ADMIN"),
  async (request, response) => {
    const { reference } = referenceParam.parse(request.params);
    const { page } = pages.parse(request.query);
    const identity = currentIdentity(request);
    response.json(
      await listTransactionFlags({
        page,
        reference,
        flaggedBy: identity.role === "STAFF" ? identity.id : undefined,
      }),
    );
  },
);
relatedFlagsRouter.post(
  "/flag",
  requireWebOrigin,
  requireRole("STAFF"),
  async (request, response) => {
    const { reference } = referenceParam.parse(request.params);
    const { reason } = flagInput.parse(request.body);
    response.status(201).json({
      flag: await flagTransaction(
        reference,
        currentIdentity(request).id,
        reason,
      ),
    });
  },
);

export const transactionFlagsRouter = Router();
transactionFlagsRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
transactionFlagsRouter.use(requireAuth, requireRole("ADMIN"));
transactionFlagsRouter.get("/", async (request, response) => {
  response.json(await listTransactionFlags(queueFilters.parse(request.query)));
});
transactionFlagsRouter.post(
  "/:id/resolve",
  requireWebOrigin,
  async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    const { note } = resolutionInput.parse(request.body);
    response.json({
      flag: await resolveFlag(id, currentIdentity(request).id, note),
    });
  },
);
