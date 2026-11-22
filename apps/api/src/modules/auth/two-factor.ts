import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { RequestHandler } from "express";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { generateSecret, verify } from "otplib";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import { authenticators, sessions, users } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { releaseSuccessfulAttempt, reserveAttempt } from "./attempts.ts";
import { authDigest } from "./auth-config.ts";
import { verifyCredential } from "./credentials.ts";
import { currentIdentity } from "./guards.ts";

const setupDurationMs = 10 * 60 * 1000;
export const authenticatorCode = z.string().regex(/^\d{6}$/);
const recoveryCode = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
const password = z.string().min(1).max(128);
const setupPayload = z.strictObject({
  secret: z.string().regex(/^[A-Z2-7]{32}$/),
  expires: z.number().int(),
});
export const setupInput = z.strictObject({ password });
export const enableInput = z.strictObject({
  ticket: z.string().max(512),
  code: authenticatorCode,
});
export const disableInput = z.strictObject({
  password,
  code: z.union([authenticatorCode, recoveryCode]),
});

function encryptionKey() {
  const key = process.env.TOTP_ENCRYPTION_KEY ?? "";
  if (!/^[a-f\d]{64}$/i.test(key)) return undefined;
  return Buffer.from(key, "hex");
}

function requiredKey() {
  const key = encryptionKey();
  if (!key)
    throw new ApiError(
      503,
      "AUTHENTICATOR_UNAVAILABLE",
      "Authenticator verification is unavailable.",
    );
  return key;
}

function seal(value: string, context: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requiredKey(), nonce).setAAD(
    Buffer.from(context),
  );
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}

function open(value: string, context: string) {
  const key = requiredKey();
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12))
    .setAAD(Buffer.from(context))
    .setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

function recoveryHash(code: string) {
  return createHash("sha256").update(code).digest();
}

const invalidCode = () =>
  new ApiError(
    403,
    "INVALID_AUTHENTICATOR_CODE",
    "Use a fresh authenticator code.",
  );
const alreadyEnabled = () =>
  new ApiError(
    409,
    "AUTHENTICATOR_ALREADY_ENABLED",
    "Authenticator verification is already enabled.",
  );
const unavailableSetup = () =>
  new ApiError(
    409,
    "AUTHENTICATOR_SETUP_EXPIRED",
    "Start authenticator setup again.",
  );
const accountPasswordSubject = (userId: string) =>
  authDigest("totp", "password:" + userId);
const authenticatorSubject = (userId: string) =>
  authDigest("totp", "code:" + userId);

async function checkPassword(userId: string, value: string) {
  const subject = accountPasswordSubject(userId);
  const window = await reserveAttempt("TOTP", subject);
  const [account] = await getDatabase()
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  if (!(await verifyCredential(value, account?.hash))) {
    throw new ApiError(
      403,
      "AUTHENTICATOR_PASSWORD_INVALID",
      "The account password is incorrect.",
    );
  }
  await releaseSuccessfulAttempt("TOTP", subject, window);
}

async function findAuthenticator(userId: string) {
  const [row] = await getDatabase()
    .select()
    .from(authenticators)
    .where(eq(authenticators.userId, userId));
  return row;
}

export async function authenticatorStatus(userId: string) {
  return {
    available: Boolean(encryptionKey()),
    enabled: Boolean(await findAuthenticator(userId)),
  };
}

export async function beginAuthenticatorSetup(
  userId: string,
  session: string,
  password: string,
) {
  requiredKey();
  if (await findAuthenticator(userId)) throw alreadyEnabled();
  await checkPassword(userId, password);
  const secret = generateSecret();
  const ticket = seal(
    JSON.stringify({ secret, expires: Date.now() + setupDurationMs }),
    "setup:" + userId + ":" + session,
  );
  return { secret, ticket };
}

async function checkCode(
  secret: string,
  token: string,
  afterTimeStep?: number,
) {
  const match = await verify({
    secret,
    token,
    algorithm: "sha1",
    digits: 6,
    period: 30,
    epochTolerance: 30,
    afterTimeStep,
  });
  return match.valid && "timeStep" in match ? match.timeStep : undefined;
}

type AuthTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

async function lockCurrentSession(
  tx: AuthTransaction,
  userId: string,
  session: string,
) {
  // Use the same user-first lock order as session creation and account access changes.
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.blocked, false),
        eq(users.accessActive, true),
      ),
    )
    .for("update");
  const [active] = user
    ? await tx
        .select({ digest: sessions.tokenDigest })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            eq(sessions.tokenDigest, session),
            gt(sessions.expiresAt, sql`now()`),
          ),
        )
        .for("update")
    : [];
  if (!active) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
}

async function revokeOtherSessions(
  tx: AuthTransaction,
  userId: string,
  session: string,
) {
  await tx
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.tokenDigest, session)));
}

export async function enableAuthenticator(
  userId: string,
  session: string,
  ticket: string,
  code: string,
) {
  requiredKey();
  let payload: z.infer<typeof setupPayload>;
  try {
    payload = setupPayload.parse(
      JSON.parse(open(ticket, "setup:" + userId + ":" + session)),
    );
  } catch {
    throw unavailableSetup();
  }
  if (payload.expires <= Date.now()) throw unavailableSetup();
  const subject = authenticatorSubject(userId);
  const window = await reserveAttempt("TOTP", subject);
  const timeStep = await checkCode(payload.secret, code);
  if (timeStep === undefined) throw invalidCode();
  const recovery = randomBytes(16).toString("base64url");
  await getDatabase().transaction(async (tx) => {
    await lockCurrentSession(tx, userId, session);
    const [inserted] = await tx
      .insert(authenticators)
      .values({
        userId,
        secretCiphertext: seal(payload.secret, "authenticator:" + userId),
        recoveryDigest: recoveryHash(recovery).toString("hex"),
        lastTimeStep: timeStep,
      })
      .onConflictDoNothing()
      .returning({ id: authenticators.userId });
    if (!inserted) throw alreadyEnabled();
    await revokeOtherSessions(tx, userId, session);
  });
  await releaseSuccessfulAttempt("TOTP", subject, window);
  return { recoveryCode: recovery };
}

export async function disableAuthenticator(
  userId: string,
  session: string,
  password: string,
  code: string,
) {
  const current = await findAuthenticator(userId);
  if (!current)
    throw new ApiError(
      409,
      "AUTHENTICATOR_NOT_ENABLED",
      "Authenticator verification is already off.",
    );
  await checkPassword(userId, password);
  const subject = authenticatorSubject(userId);
  const window = await reserveAttempt("TOTP", subject);
  const usingRecovery = recoveryCode.safeParse(code).success;
  const timeStep = usingRecovery
    ? undefined
    : await checkCode(
        open(current.secretCiphertext, "authenticator:" + userId),
        code,
        current.lastTimeStep,
      );
  if (
    usingRecovery
      ? !timingSafeEqual(
          recoveryHash(code),
          Buffer.from(current.recoveryDigest, "hex"),
        )
      : timeStep === undefined
  )
    throw invalidCode();

  await getDatabase().transaction(async (tx) => {
    await lockCurrentSession(tx, userId, session);
    const [removed] = await tx
      .delete(authenticators)
      .where(
        and(
          eq(authenticators.userId, userId),
          eq(authenticators.secretCiphertext, current.secretCiphertext),
          timeStep !== undefined
            ? lt(authenticators.lastTimeStep, timeStep)
            : undefined,
        ),
      )
      .returning({ id: authenticators.userId });
    if (!removed) throw invalidCode();
    await revokeOtherSessions(tx, userId, session);
  });
  await releaseSuccessfulAttempt("TOTP", subject, window);
}

export const requireAuthenticator: RequestHandler = async (
  request,
  _response,
  next,
) => {
  const { id } = currentIdentity(request);
  const active = await findAuthenticator(id);
  if (!active) return next();
  const presented = request.get("X-BankBolt-Authenticator-Code");
  if (!presented)
    throw new ApiError(
      403,
      "AUTHENTICATOR_CODE_REQUIRED",
      "Enter an authenticator code to continue.",
    );
  const subject = authenticatorSubject(id);
  const window = await reserveAttempt("TOTP", subject);
  const code = authenticatorCode.safeParse(presented);
  if (!code.success) throw invalidCode();
  const timeStep = await checkCode(
    open(active.secretCiphertext, "authenticator:" + id),
    code.data,
    active.lastTimeStep,
  );
  if (timeStep === undefined) throw invalidCode();
  const [claimed] = await getDatabase()
    .update(authenticators)
    .set({ lastTimeStep: timeStep })
    .where(
      and(
        eq(authenticators.userId, id),
        eq(authenticators.secretCiphertext, active.secretCiphertext),
        lt(authenticators.lastTimeStep, timeStep),
      ),
    )
    .returning({ id: authenticators.userId });
  if (!claimed) throw invalidCode();
  await releaseSuccessfulAttempt("TOTP", subject, window);
  next();
};
