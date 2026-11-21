import { z } from "zod";
import { nonnegativePoisha } from "../../lib/money.ts";
import { transactionPin } from "../auth/transaction-pin.ts";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const transferKeyParams = z.strictObject({ idempotencyKey: uuid });
export const transferRequest = z.strictObject({
  sourceAccountId: uuid,
  recipientAccountNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{12}$/),
  amountPoisha: nonnegativePoisha.refine((amount) => amount > 0n),
  description: z.string().trim().min(1).max(300),
  pin: transactionPin,
  idempotencyKey: uuid,
});
