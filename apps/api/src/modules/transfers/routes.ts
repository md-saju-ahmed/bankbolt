import { Router } from "express";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { createTransfer, recoverTransfer } from "./service.ts";
import { transferKeyParams, transferRequest } from "./validation.ts";

export const transfersRouter = Router();
transfersRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
transfersRouter.use(requireAuth, requireRole("CUSTOMER"));

transfersRouter.post("/", requireWebOrigin, async (request, response) => {
  const input = transferRequest.parse(request.body);
  const { transfer, replayed } = await createTransfer(
    currentIdentity(request),
    input,
  );
  response.status(replayed ? 200 : 201).json({ transfer });
});

transfersRouter.get("/by-key/:idempotencyKey", async (request, response) => {
  const { idempotencyKey } = transferKeyParams.parse(request.params);
  const transfer = await recoverTransfer(
    currentIdentity(request).id,
    idempotencyKey,
  );
  response.json({ transfer });
});
