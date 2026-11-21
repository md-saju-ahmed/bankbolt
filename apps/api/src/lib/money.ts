import { z } from "zod";

export const nonnegativePoisha = z
  .string()
  .regex(/^[0-9]{1,19}$/)
  .transform(BigInt)
  .refine((value) => value <= 9_223_372_036_854_775_807n);

// Round an exact fraction of a poisha to the nearest integer, with ties away from zero.
export function roundPoisha(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("The denominator must be positive.");
  }

  const whole = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) return whole + 1n;
  if (remainder * 2n <= -denominator) return whole - 1n;
  return whole;
}
