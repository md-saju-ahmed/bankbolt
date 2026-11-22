import { randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { getDatabase } from "../../db/client.ts";
import { sessions, users } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { authDigest, isProduction } from "./auth-config.ts";

const sessionDurationMs = 8 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, sameSite: "lax", path: "/" } as const;

export const publicIdentity = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  role: users.role,
};

export type Identity = Pick<
  typeof users.$inferSelect,
  keyof typeof publicIdentity
>;

function cookieName() {
  return isProduction() ? "__Host-bankbolt_session" : "bankbolt_session";
}

export function presentedDigest(request: Request) {
  const prefix = `${cookieName()}=`;
  const cookies = (request.get("Cookie") ?? "")
    .split(";")
    .map((value) => value.trim());
  const matches = cookies.filter((value) => value.startsWith(prefix));
  const token = matches.length === 1 ? matches[0].slice(prefix.length) : "";
  return /^[A-Za-z0-9_-]{43}$/.test(token)
    ? authDigest("session", token)
    : undefined;
}

export async function createSession(
  request: Request,
  response: Response,
  userId: string,
) {
  const previous = presentedDigest(request);
  const token = randomBytes(32).toString("base64url");
  const tokenDigest = authDigest("session", token);
  const expiresAt = new Date(Date.now() + sessionDurationMs);

  await getDatabase().transaction(async (transaction) => {
    const [user] = await transaction
      .select({ blocked: users.blocked, active: users.accessActive })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user || user.blocked || !user.active) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    }
    if (previous) {
      await transaction
        .delete(sessions)
        .where(eq(sessions.tokenDigest, previous));
    }
    await transaction
      .insert(sessions)
      .values({ tokenDigest, userId, expiresAt });
  });

  response.cookie(cookieName(), token, {
    ...cookieOptions,
    secure: isProduction(),
    maxAge: sessionDurationMs,
  });
}

export async function loadSession(request: Request) {
  const tokenDigest = presentedDigest(request);
  if (!tokenDigest) return undefined;

  const [session] = await getDatabase()
    .select({
      identity: publicIdentity,
      blocked: users.blocked,
      active: users.accessActive,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenDigest, tokenDigest),
        gt(sessions.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return session;
}

export async function deleteSession(request: Request) {
  const digest = presentedDigest(request);
  if (digest)
    await getDatabase()
      .delete(sessions)
      .where(eq(sessions.tokenDigest, digest));
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(cookieName(), {
    ...cookieOptions,
    secure: isProduction(),
  });
}
