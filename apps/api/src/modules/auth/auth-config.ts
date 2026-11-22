import { createHmac } from "node:crypto";
import type { RequestHandler } from "express";
import { ApiError } from "../../errors.ts";

export function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function authDigest(
  purpose: "session" | "login" | "totp",
  value: string,
) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes.");
  }

  return createHmac("sha256", secret)
    .update(purpose)
    .update(":")
    .update(value)
    .digest("hex");
}

export const requireWebOrigin: RequestHandler = (request, _response, next) => {
  const configured =
    process.env.WEB_ORIGIN ?? (isProduction() ? "" : "http://localhost:3000");
  const origin = URL.parse(configured);
  if (
    !origin ||
    origin.origin !== configured ||
    (origin.protocol !== "https:" &&
      (isProduction() || origin.protocol !== "http:"))
  ) {
    throw new Error(
      "WEB_ORIGIN must be a valid web origin. Deployed environments require HTTPS.",
    );
  }

  if (request.get("Origin") !== origin.origin) {
    throw new ApiError(
      403,
      "INVALID_ORIGIN",
      "This request must come from the BankBolt web app.",
    );
  }

  next();
};
