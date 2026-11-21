import { z } from "zod";
import {
  accountStatus,
  accountType,
  verificationStatus,
} from "../../db/schema.ts";
import { nonnegativePoisha } from "../../lib/money.ts";
import { pages } from "../onboarding/validation.ts";

const search = pages.extend({ q: z.string().trim().max(160).default("") });
export const customerSearch = search.extend({
  verification: z.enum(verificationStatus.enumValues).optional(),
  accessStatus: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).optional(),
});
export const accountSearch = search.extend({
  type: z.enum(accountType.enumValues).optional(),
  status: z.enum(accountStatus.enumValues).optional(),
});

const reason = z.string().trim().min(3).max(300);
export const accessUpdate = z.strictObject({
  action: z.enum(["ACTIVATE", "DEACTIVATE", "BLOCK"]),
  reason,
});

export const accountUpdate = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("status"),
    action: z.enum(["FREEZE", "UNFREEZE", "DEACTIVATE", "REACTIVATE"]),
    reason,
  }),
  z.strictObject({
    kind: z.literal("limits"),
    transferLimitPoisha: nonnegativePoisha,
    dailyTransferLimitPoisha: nonnegativePoisha,
    reason,
  }),
  z.strictObject({
    kind: z.literal("metadata"),
    businessName: z.string().trim().min(1).max(120).nullable(),
    businessRegistrationReference: z.string().trim().min(1).max(80).nullable(),
    reason,
  }),
]);
