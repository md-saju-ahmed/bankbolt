import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import { customerProfiles, userRole, users } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { reserveAttempt } from "./attempts.ts";
import { authDigest, requireWebOrigin } from "./auth-config.ts";
import { verifyCredential } from "./credentials.ts";
import { currentIdentity, requireAuth, requireRole } from "./guards.ts";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  publicIdentity,
} from "./sessions.ts";
import { changeTransactionPin, pinChange } from "./transaction-pin.ts";

const loginBody = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(128),
});

export const authRouter = Router();

authRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});

authRouter.post("/login", requireWebOrigin, async (request, response) => {
  const { email, password } = loginBody.parse(request.body);
  await reserveAttempt("LOGIN", authDigest("login", email));
  const [user] = await getDatabase()
    .select({
      identity: publicIdentity,
      passwordHash: users.passwordHash,
      blocked: users.blocked,
      active: users.accessActive,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const valid = await verifyCredential(password, user?.passwordHash);
  if (!valid || !user || user.blocked || !user.active) {
    throw new ApiError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
    );
  }

  await createSession(request, response, user.identity.id);
  response.json({ user: user.identity });
});

authRouter.get("/me", requireAuth, (request, response) => {
  response.json({ user: currentIdentity(request) });
});

authRouter.put(
  "/transaction-pin",
  requireWebOrigin,
  requireAuth,
  requireRole("CUSTOMER"),
  async (request, response) => {
    await changeTransactionPin(
      currentIdentity(request).id,
      pinChange.parse(request.body),
    );
    response.status(204).end();
  },
);

authRouter.get(
  "/transaction-pin",
  requireAuth,
  requireRole("CUSTOMER"),
  async (request, response) => {
    const [profile] = await getDatabase()
      .select({ pinHash: customerProfiles.pinHash })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, currentIdentity(request).id));
    if (!profile)
      throw new ApiError(404, "NOT_FOUND", "Customer profile not found.");
    response.json({ configured: profile.pinHash !== null });
  },
);

for (const role of userRole.enumValues) {
  authRouter.get(
    `/workspaces/${role.toLowerCase()}`,
    requireAuth,
    requireRole(role),
    (request, response) => {
      response.json({ user: currentIdentity(request) });
    },
  );
}

authRouter.post(
  "/logout",
  requireWebOrigin,
  requireAuth,
  async (request, response) => {
    await deleteSession(request);
    clearSessionCookie(response);
    response.status(204).end();
  },
);
