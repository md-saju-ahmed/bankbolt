import { Router } from "express";
import { z } from "zod";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { requireAuthenticator } from "../auth/two-factor.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { pages } from "../onboarding/validation.ts";
import {
  accountDetails,
  changeAccess,
  customerDetails,
  searchAccounts,
  searchCustomers,
  updateAccount,
} from "./service.ts";
import {
  accessUpdate,
  accountSearch,
  accountUpdate,
  customerSearch,
} from "./validation.ts";

export const managementRouter = Router();
managementRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
managementRouter.use(requireAuth, requireRole("ADMIN", "STAFF"));

managementRouter.post(
  "/customers/search",
  requireWebOrigin,
  async (req, res) => {
    res.json(await searchCustomers(customerSearch.parse(req.body)));
  },
);
managementRouter.get("/customers/:id", async (req, res) => {
  res.json(
    await customerDetails(
      z.uuid().parse(req.params.id),
      pages.parse(req.query).page,
      currentIdentity(req).role === "ADMIN",
    ),
  );
});
managementRouter.patch(
  "/customers/:id/access",
  requireWebOrigin,
  requireRole("ADMIN"),
  requireAuthenticator,
  async (req, res) => {
    await changeAccess(
      z.uuid().parse(req.params.id),
      accessUpdate.parse(req.body),
      currentIdentity(req).id,
    );
    res.status(204).end();
  },
);
managementRouter.post(
  "/accounts/search",
  requireWebOrigin,
  async (req, res) => {
    res.json(await searchAccounts(accountSearch.parse(req.body)));
  },
);
managementRouter.get("/accounts/:id", async (req, res) => {
  res.json(
    await accountDetails(
      z.uuid().parse(req.params.id),
      pages.parse(req.query).page,
    ),
  );
});
managementRouter.patch(
  "/accounts/:id",
  requireWebOrigin,
  requireRole("ADMIN"),
  requireAuthenticator,
  async (req, res) => {
    await updateAccount(
      z.uuid().parse(req.params.id),
      accountUpdate.parse(req.body),
      currentIdentity(req).id,
    );
    res.status(204).end();
  },
);
