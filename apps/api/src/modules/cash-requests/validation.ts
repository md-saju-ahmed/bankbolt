import { z } from "zod";
import { cashRequestStatus, cashRequestType } from "../../db/schema.ts";
import { nonnegativePoisha } from "../../lib/money.ts";
import { pages } from "../onboarding/validation.ts";

export const cashRequestParams = z.strictObject({ id: z.uuid() });
export const cashRequestFilters = pages.extend({
  status: z.enum(cashRequestStatus.enumValues).optional(),
  type: z.enum(cashRequestType.enumValues).optional(),
});

export const cashRequestInput = z.strictObject({
  accountId: z.uuid(),
  type: z.enum(cashRequestType.enumValues),
  amountPoisha: nonnegativePoisha.refine((amount) => amount > 0n),
  description: z.string().trim().min(1).max(300),
});

export const approvalInput = z.strictObject({}).default({});
export const rejectionInput = z.strictObject({
  reason: z.string().trim().min(1).max(300),
});
