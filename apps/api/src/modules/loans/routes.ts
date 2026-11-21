import { Router } from "express";
import { z } from "zod";
import { loanStatus } from "../../db/schema.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { pages } from "../onboarding/validation.ts";
import { annualLoanRateBps, loanCatalog, loanTypes } from "./catalog.ts";
import { getLoan, listLoans } from "./service.ts";

const loanFilters = pages.extend({
  status: z.enum(loanStatus.enumValues).optional(),
});
const catalog = loanTypes.map((type) => {
  const product = loanCatalog[type];
  return {
    ...product,
    type,
    annualRateBps: annualLoanRateBps,
    minPrincipalPoisha: product.minPrincipalPoisha.toString(),
    maxPrincipalPoisha: product.maxPrincipalPoisha.toString(),
  };
});

export const loansRouter = Router();
loansRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
loansRouter.use(requireAuth, requireRole("CUSTOMER", "STAFF", "ADMIN"));

loansRouter.get("/catalog", (_request, response) => {
  response.json({ products: catalog });
});
loansRouter.get("/", async (request, response) => {
  const { page, status } = loanFilters.parse(request.query);
  response.json(await listLoans(currentIdentity(request), page, status));
});
loansRouter.get("/:id", async (request, response) => {
  response.json(
    await getLoan(currentIdentity(request), z.uuid().parse(request.params.id)),
  );
});
