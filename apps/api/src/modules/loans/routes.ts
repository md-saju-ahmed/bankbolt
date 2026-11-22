import { Router } from "express";
import { z } from "zod";
import { loanStatus } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { pages } from "../onboarding/validation.ts";
import { annualLoanRateBps, loanCatalog, loanTypes } from "./catalog.ts";
import { calculateLoanEmi } from "./calculations.ts";
import {
  decideLoan,
  disburseLoan,
  repayInstallment,
  settleLoan,
} from "./servicing.ts";
import {
  addLoanReviewNote,
  createLoanApplication,
  forwardLoan,
  getLoan,
  listLoans,
  startLoanReview,
} from "./service.ts";
import {
  applicationInput,
  assertApplicationTerms,
  estimateInput,
  loanDecisionInput,
  loanRepaymentInput,
  loanRepaymentParams,
  loanSettlementInput,
  loanReviewActionInput,
  loanReviewNoteInput,
} from "./validation.ts";

const loanFilters = pages.extend({
  status: z.enum(loanStatus.enumValues).optional(),
  forwarded: z.enum(["true", "false"]).optional(),
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
  const filters = loanFilters.parse(request.query);
  const identity = currentIdentity(request);
  if (identity.role === "CUSTOMER" && filters.forwarded !== undefined) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "This loan filter is for Staff and Admin.",
    );
  }
  response.json(await listLoans(identity, filters));
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

const requireReviewer = requireRole("STAFF", "ADMIN");
const requireAdmin = requireRole("ADMIN");

loansRouter.post(
  "/:id/review",
  requireWebOrigin,
  requireReviewer,
  async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    loanReviewActionInput.parse(request.body);
    const loan = await startLoanReview(currentIdentity(request), id);
    response.json({ loan });
  },
);

loansRouter.post(
  "/:id/notes",
  requireWebOrigin,
  requireReviewer,
  async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    const { note } = loanReviewNoteInput.parse(request.body);
    const savedNote = await addLoanReviewNote(
      currentIdentity(request),
      id,
      note,
    );
    response.status(201).json({ note: savedNote });
  },
);

loansRouter.post(
  "/:id/forward",
  requireWebOrigin,
  requireReviewer,
  async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    loanReviewActionInput.parse(request.body);
    const loan = await forwardLoan(currentIdentity(request), id);
    response.json({ loan });
  },
);

loansRouter.post(
  "/:id/approve",
  requireWebOrigin,
  requireAdmin,
  async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    const { reason } = loanDecisionInput.parse(request.body);
    response.json({
      loan: await decideLoan(currentIdentity(request), id, "APPROVED", reason),
    });
  },
);

loansRouter.post(
  "/:id/reject",
  requireWebOrigin,
  requireAdmin,
  async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    const { reason } = loanDecisionInput.parse(request.body);
    response.json({
      loan: await decideLoan(currentIdentity(request), id, "REJECTED", reason),
    });
  },
);

loansRouter.post(
  "/:id/disburse",
  requireWebOrigin,
  requireAdmin,
  async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    loanReviewActionInput.parse(request.body);
    response.json(await disburseLoan(currentIdentity(request), id));
  },
);

loansRouter.post(
  "/:id/installments/:number/repay",
  requireWebOrigin,
  requireRole("CUSTOMER"),
  async (request, response) => {
    const { id, number } = loanRepaymentParams.parse(request.params);
    const { accountId, pin, expectedAmountPoisha } = loanRepaymentInput.parse(
      request.body,
    );
    response.json(
      await repayInstallment(
        currentIdentity(request),
        id,
        number,
        accountId,
        pin,
        expectedAmountPoisha,
      ),
    );
  },
);

loansRouter.post(
  "/:id/settle",
  requireWebOrigin,
  requireRole("CUSTOMER"),
  async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    const { accountId, pin, expectedAmountPoisha } = loanSettlementInput.parse(
      request.body,
    );
    response.json(
      await settleLoan(
        currentIdentity(request),
        id,
        accountId,
        pin,
        expectedAmountPoisha,
      ),
    );
  },
);
