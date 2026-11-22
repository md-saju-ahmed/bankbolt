import { z } from "zod";
import { ApiError } from "../../errors.ts";
import { nonnegativePoisha } from "../../lib/money.ts";
import { transactionPin } from "../auth/transaction-pin.ts";
import { loanTypes, validLoanTerms } from "./catalog.ts";

const termMonths = z.number().int();
const termsInput = z.strictObject({
  type: z.enum(loanTypes),
  requestedPrincipalPoisha: nonnegativePoisha,
  termMonths,
});

export const estimateInput = termsInput.extend({
  termMonths: z
    .string()
    .regex(/^[0-9]{1,2}$/)
    .transform(Number)
    .pipe(termMonths),
});

export const applicationInput = termsInput.extend({
  disbursementAccountId: z.uuid(),
  monthlyIncomePoisha: nonnegativePoisha,
  employmentStatus: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => !value.includes("\0")),
  description: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((value) => !value.includes("\0")),
});

export const loanReviewActionInput = z.strictObject({}).default({});

export const loanReviewNoteInput = z.strictObject({
  note: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((value) => !value.includes("\0")),
});

export const loanDecisionInput = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((value) => !value.includes("\0")),
});

export const loanRepaymentParams = z.strictObject({
  id: z.uuid(),
  number: z
    .string()
    .regex(/^[1-9][0-9]?$/)
    .transform(Number)
    .pipe(z.number().max(60)),
});

export const loanRepaymentInput = z.strictObject({
  accountId: z.uuid(),
  pin: transactionPin,
  expectedAmountPoisha: nonnegativePoisha.optional(),
});

export function assertApplicationTerms(terms: z.infer<typeof termsInput>) {
  if (
    !validLoanTerms(
      terms.type,
      terms.requestedPrincipalPoisha,
      terms.termMonths,
    )
  ) {
    throw new ApiError(
      422,
      "LOAN_TERMS_OUT_OF_RANGE",
      "Use an amount and term within this loan type's limits.",
    );
  }
}
