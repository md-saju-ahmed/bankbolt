import type { Request, RequestHandler } from "express";
import { ApiError } from "../../errors.ts";
import {
  clearSessionCookie,
  deleteSession,
  loadSession,
  type Identity,
} from "./sessions.ts";

const requestIdentity = new WeakMap<Request, Identity>();

export function currentIdentity(request: Request) {
  const identity = requestIdentity.get(request);
  if (!identity) {
    throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
  }
  return identity;
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  const session = await loadSession(request);
  if (!session) {
    clearSessionCookie(response);
    throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
  }
  if (session.blocked || !session.active) {
    await deleteSession(request);
    clearSessionCookie(response);
    throw new ApiError(
      403,
      "ACCOUNT_BLOCKED",
      "This account's access is restricted.",
    );
  }

  requestIdentity.set(request, session.identity);
  next();
};

export function requireRole(...roles: Identity["role"][]): RequestHandler {
  return (request, _response, next) => {
    if (!roles.includes(currentIdentity(request).role)) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You do not have access to this resource.",
      );
    }
    next();
  };
}
