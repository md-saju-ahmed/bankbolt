import { Router } from "express";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { requireAuthenticator } from "../auth/two-factor.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { createTransfer, quoteTransfer, recoverTransfer } from "./service.ts";
import {
  transferKeyParams,
  transferQuote,
  transferRequest,
} from "./validation.ts";

export const transfersRouter = Router();
transfersRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
transfersRouter.use(requireAuth, requireRole("CUSTOMER"));

transfersRouter.post("/quote", requireWebOrigin, async (request, response) => {
  const quote = await quoteTransfer(
    currentIdentity(request).id,
    transferQuote.parse(request.body),
  );
  response.json({ quote });
});

transfersRouter.post(
  "/",
  requireWebOrigin,
  requireAuthenticator,
  async (request, response) => {
    const input = transferRequest.parse(request.body);
    const { transfer, replayed } = await createTransfer(
      currentIdentity(request),
      input,
    );
    response.status(replayed ? 200 : 201).json({ transfer });
  },
);

transfersRouter.get("/by-key/:idempotencyKey", async (request, response) => {
  const { idempotencyKey } = transferKeyParams.parse(request.params);
  const transfer = await recoverTransfer(
    currentIdentity(request).id,
    idempotencyKey,
  );
  response.json({ transfer });
});
