import { Router } from "express";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { requireAuthenticator } from "../auth/two-factor.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import {
  createCashRequest,
  decideCashRequest,
  getCashRequest,
  listCashRequests,
} from "./service.ts";
import {
  approvalInput,
  cashRequestFilters,
  cashRequestInput,
  cashRequestParams,
  rejectionInput,
} from "./validation.ts";

export const cashRequestsRouter = Router();
cashRequestsRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
cashRequestsRouter.use(requireAuth, requireRole("CUSTOMER", "ADMIN", "STAFF"));

cashRequestsRouter.get("/", async (request, response) => {
  response.json(
    await listCashRequests(
      currentIdentity(request),
      cashRequestFilters.parse(request.query),
    ),
  );
});

cashRequestsRouter.get("/:id", async (request, response) => {
  const { id } = cashRequestParams.parse(request.params);
  response.json({
    request: await getCashRequest(currentIdentity(request), id),
  });
});

cashRequestsRouter.post(
  "/",
  requireWebOrigin,
  requireRole("CUSTOMER"),
  requireAuthenticator,
  async (request, response) => {
    const input = cashRequestInput.parse(request.body);
    response.status(201).json({
      request: await createCashRequest(currentIdentity(request).id, input),
    });
  },
);

cashRequestsRouter.post(
  "/:id/cancel",
  requireWebOrigin,
  requireRole("CUSTOMER"),
  requireAuthenticator,
  async (request, response) => {
    const { id } = cashRequestParams.parse(request.params);
    approvalInput.parse(request.body);
    response.json({
      request: await decideCashRequest(currentIdentity(request).id, id, {
        status: "CANCELLED",
      }),
    });
  },
);

cashRequestsRouter.post(
  "/:id/approve",
  requireWebOrigin,
  requireRole("ADMIN", "STAFF"),
  requireAuthenticator,
  async (request, response) => {
    const { id } = cashRequestParams.parse(request.params);
    approvalInput.parse(request.body);
    response.json({
      request: await decideCashRequest(currentIdentity(request).id, id, {
        status: "APPROVED",
      }),
    });
  },
);

cashRequestsRouter.post(
  "/:id/reject",
  requireWebOrigin,
  requireRole("ADMIN", "STAFF"),
  requireAuthenticator,
  async (request, response) => {
    const { id } = cashRequestParams.parse(request.params);
    const { reason } = rejectionInput.parse(request.body);
    response.json({
      request: await decideCashRequest(currentIdentity(request).id, id, {
        status: "REJECTED",
        reason,
      }),
    });
  },
);
