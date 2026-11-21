import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65535);

export function parsePort(value: string | undefined) {
  const result = portSchema.safeParse(value ?? "4000");

  if (!result.success) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return result.data;
}
