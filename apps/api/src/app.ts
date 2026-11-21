import express from "express";
import { z } from "zod";
import { handleError, notFound } from "./errors.ts";
import { authRouter } from "./modules/auth/routes.ts";
import { cashRequestsRouter } from "./modules/cash-requests/routes.ts";
import { ownedAccountsRouter } from "./modules/accounts/owned-routes.ts";
import { managementRouter } from "./modules/management/routes.ts";
import { onboardingRouter } from "./modules/onboarding/routes.ts";
import { transfersRouter } from "./modules/transfers/routes.ts";
import { transactionsRouter } from "./modules/transactions/routes.ts";
import { transactionFlagsRouter } from "./modules/transaction-flags/routes.ts";

const app = express();
const api = express.Router();
const healthQuery = z.strictObject({});

app.disable("x-powered-by");

api.use(express.json());
api.use("/auth", authRouter);
api.use("/customers", onboardingRouter);
api.use("/management", managementRouter);
api.use("/accounts", ownedAccountsRouter);
api.use("/transfers", transfersRouter);
api.use("/transactions", transactionsRouter);
api.use("/transaction-flags", transactionFlagsRouter);
api.use("/cash-requests", cashRequestsRouter);
api.get("/health", (request, response) => {
  healthQuery.parse(request.query);
  response.set("Cache-Control", "no-store").json({ status: "ok" });
});

app.use("/api/v1", api);
app.use(notFound);
app.use(handleError);

export default app;
