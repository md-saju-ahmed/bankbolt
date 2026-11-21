import { Router } from "express";
import { z } from "zod";
import { loanStatus } from "../../db/schema.ts";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { pages } from "../onboarding/validation.ts";
import { annualLoanRateBps, loanCatalog, loanTypes } from "./catalog.ts";
import { createLoanApplication, getLoan, listLoans } from "./service.ts";
import { calculateLoanEmi } from "./calculations.ts";
import {
  applicationInput,
  assertApplicationTerms,
  estimateInput,
} from "./validation.ts";

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
loansRouter.get("/estimate", (request, response) => {
  const terms = estimateInput.parse(request.query);
  assertApplicationTerms(terms);
  response.json({
    emiPoisha: calculateLoanEmi(
      terms.type,
      terms.requestedPrincipalPoisha,
      terms.termMonths,
    ).toString(),
    annualRateBps: annualLoanRateBps,
  });
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
loansRouter.post(
  "/",
  requireWebOrigin,
  requireRole("CUSTOMER"),
  async (request, response) => {
    const loan = await createLoanApplication(
      currentIdentity(request),
      applicationInput.parse(request.body),
    );
    response.status(201).json({ loan });
  },
);
