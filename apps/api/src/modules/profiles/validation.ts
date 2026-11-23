import { z } from "zod";
import {
  customerAddress,
  customerEmail,
  customerFullName,
  customerOccupation,
  customerPhone,
  externalPhotoUrl,
} from "../onboarding/validation.ts";

const reason = z.string().trim().min(3).max(300);

export const profileChange = z.strictObject({
  changes: z
    .strictObject({
      fullName: customerFullName.optional(),
      email: customerEmail.optional(),
      phone: customerPhone.optional(),
      address: customerAddress.optional(),
      occupation: customerOccupation.nullable().optional(),
      photoUrl: externalPhotoUrl.nullable().optional(),
    })
    .refine((input) => Object.keys(input).length > 0),
  reason,
});

export const profileDecision = z.strictObject({
  status: z.enum(["APPROVED", "REJECTED"]),
  reason,
});
