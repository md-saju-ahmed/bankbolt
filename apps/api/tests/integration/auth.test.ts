import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import app from "../../src/app.ts";
import { getDatabase } from "../../src/db/client.ts";
import {
  authAttempts,
  customerProfiles,
  sessions,
  users,
} from "../../src/db/schema.ts";
import { handleError } from "../../src/errors.ts";
import { authDigest } from "../../src/modules/auth/auth-config.ts";
import {
  requireOwnedCustomerProfile,
  verifyTransactionPin,
} from "../../src/modules/auth/customer-scope.ts";
import { hashCredential } from "../../src/modules/auth/credentials.ts";
import {
  currentIdentity,
  requireAuth,
  requireRole,
} from "../../src/modules/auth/guards.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

const origin = "http://localhost:3000";
const password = "Local test credential";
const runId = randomUUID();
const identities = [
  { key: "admin", role: "ADMIN" },
  { key: "staff", role: "STAFF" },
  { key: "customer", role: "CUSTOMER" },
  { key: "neighbor", role: "CUSTOMER" },
] as const;
type FixtureEmail = (typeof identities)[number]["key"] | "missing";
const email = (key: FixtureEmail) => `${key}-${runId}@bankbolt.example`;
let database: ReturnType<typeof getDatabase> | undefined;
const ids = new Map<string, string>();
const profiles = new Map<string, string>();
const attemptKeys = new Set<string>();
const authUrl = "/api/v1/auth";

beforeAll(async () => {
  if (existsSync(".env.test")) loadEnvFile(".env.test");
  vi.stubEnv(
    "DATABASE_URL",
    isolatedDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.TEST_DB_PORT,
    ),
  );
  vi.stubEnv("SESSION_SECRET", randomUUID() + randomUUID());
  vi.stubEnv("WEB_ORIGIN", origin);
  vi.stubEnv("VERCEL", "");
  database = getDatabase();
  await migrate(database, { migrationsFolder: "./drizzle" });
  const passwordHash = await hashCredential(password);
  const pinHash = await hashCredential("651918");
  for (const { key, role } of identities) {
    const [user] = await database
      .insert(users)
      .values({
        email: email(key),
        role,
        fullName: `Fictional ${key}`,
        passwordHash,
      })
      .returning({ id: users.id });
    ids.set(key, user.id);
    if (role === "CUSTOMER") {
      const [profile] = await database
        .insert(customerProfiles)
        .values({
          address: "Fictional address",
          dateOfBirth: "1995-05-12",
          identityReference: randomUUID(),
          phone: "+1-202-555-0109",
          userId: user.id,
          pinHash,
        })
        .returning({ id: customerProfiles.id });
      profiles.set(key, profile.id);
    }
  }
  for (const { key } of [...identities, { key: "missing" } as const]) {
    attemptKeys.add(authDigest("login", email(key)));
  }
  for (const value of ids.values()) attemptKeys.add(value);
});

afterAll(async () => {
  try {
    if (database) {
      await database
        .delete(authAttempts)
        .where(inArray(authAttempts.subject, [...attemptKeys]));
      await database.delete(users).where(inArray(users.id, [...ids.values()]));
    }
  } finally {
    await database?.$client.end();
    vi.unstubAllEnvs();
  }
});

function signIn(key: FixtureEmail, secret = password) {
  return request(app)
    .post(`${authUrl}/login`)
    .set("Origin", origin)
    .send({ email: email(key), password: secret });
}

async function cookieFor(key: FixtureEmail) {
  const result = await signIn(key).expect(200);
  const [cookie] = result.headers["set-cookie"];
  return cookie.split(";")[0] as string;
}

function guardFixture() {
  const guarded = express();
  guarded.get(
    "/admin/settings",
    requireAuth,
    requireRole("ADMIN"),
    (_req, res) => {
      res.sendStatus(204);
    },
  );
  guarded.get(
    "/customers/:id",
    requireAuth,
    requireRole("CUSTOMER"),
    async (req, res) => {
      res.json(
        await requireOwnedCustomerProfile(
          currentIdentity(req),
          z.uuid().parse(req.params.id),
        ),
      );
    },
  );
  guarded.use(handleError);
  return request(guarded);
}

describe("persistent role authentication", () => {
  it.each(identities.slice(0, 3))(
    "logs $role in, restores identity, and revokes on logout",
    async ({ key, role }) => {
      const login = await signIn(key)
        .expect("Cache-Control", "no-store")
        .expect(200);
      expect(Object.keys(login.body.user).sort()).toEqual([
        "email",
        "fullName",
        "id",
        "photoUrl",
        "role",
      ]);
      expect(login.body.user.role).toBe(role);
      expect(login.body.user.photoUrl).toBeNull();
      const [header] = login.headers["set-cookie"];
      expect(header).toMatch(/; HttpOnly/);
      expect(header).toMatch(/; SameSite=Lax/);
      const cookie = header.split(";")[0];

      await request(app)
        .get(`${authUrl}/me`)
        .set("Cookie", cookie)
        .expect(200, login.body);
      await request(app)
        .post(`${authUrl}/logout`)
        .set("Origin", origin)
        .set("Cookie", cookie)
        .expect(204);
      await request(app).get(`${authUrl}/me`).set("Cookie", cookie).expect(401);
    },
  );

  it("rotates a previous token at sign-in", async () => {
    const previous = await cookieFor("staff");
    const replacement = await signIn("staff")
      .set("Cookie", previous)
      .expect(200);
    expect(replacement.headers["set-cookie"][0]).not.toContain(previous);
    await request(app).get(`${authUrl}/me`).set("Cookie", previous).expect(401);
  });

  it("expires sessions from the database and revokes blocked users", async () => {
    const expired = await cookieFor("neighbor");
    await getDatabase()
      .update(sessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(sessions.userId, ids.get("neighbor")!));
    await request(app).get(`${authUrl}/me`).set("Cookie", expired).expect(401);

    const blocked = await cookieFor("neighbor");
    await getDatabase()
      .update(users)
      .set({ blocked: true })
      .where(eq(users.id, ids.get("neighbor")!));
    try {
      await request(app)
        .get(`${authUrl}/me`)
        .set("Cookie", blocked)
        .expect(403);
      await request(app)
        .get(`${authUrl}/me`)
        .set("Cookie", blocked)
        .expect(401);
      await signIn("neighbor").expect(401);
    } finally {
      await getDatabase()
        .update(users)
        .set({ blocked: false })
        .where(eq(users.id, ids.get("neighbor")!));
    }
  });

  it("uses a secure host-only cookie in production", async () => {
    const previousMode = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WEB_ORIGIN", "https://web.bankbolt.example");
    try {
      const result = await signIn("admin")
        .set("Origin", "https://web.bankbolt.example")
        .expect(200);
      const [cookie] = result.headers["set-cookie"];
      expect(cookie).toMatch(/^__Host-bankbolt_session=/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; Path=\//);
      expect(cookie).not.toMatch(/; Domain=/);
    } finally {
      vi.stubEnv("NODE_ENV", previousMode);
      vi.stubEnv("WEB_ORIGIN", origin);
    }
  });
});

describe("authorization and request security", () => {
  it("denies direct access across roles and customer records", async () => {
    const guarded = guardFixture();
    const admin = await cookieFor("admin");
    const staff = await cookieFor("staff");
    const customer = await cookieFor("customer");
    await request(app).get(`${authUrl}/workspaces/admin`).expect(401);
    await request(app)
      .get(`${authUrl}/workspaces/admin`)
      .set("Cookie", admin)
      .expect(200);
    await request(app)
      .get(`${authUrl}/workspaces/admin`)
      .set("Cookie", customer)
      .expect(403);
    await guarded.get("/admin/settings").set("Cookie", staff).expect(403);
    await guarded
      .get(`/customers/${profiles.get("customer")}`)
      .set("Cookie", customer)
      .expect(200);
    await guarded
      .get(`/customers/${profiles.get("neighbor")}`)
      .set("Cookie", customer)
      .expect(404);
  });

  it("rejects missing or cross-origin sign-in and logout requests", async () => {
    await request(app)
      .post(`${authUrl}/login`)
      .send({ email: email("customer"), password })
      .expect(403);
    const cookie = await cookieFor("customer");
    await request(app)
      .post(`${authUrl}/logout`)
      .set("Origin", "http://untrusted.example")
      .set("Cookie", cookie)
      .expect(403);
    await request(app).get(`${authUrl}/me`).set("Cookie", cookie).expect(200);
  });

  it("atomically throttles concurrent failed sign-in attempts", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => signIn("missing", "incorrect")),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      ...Array(8).fill(401),
      429,
      429,
    ]);
  }, 15_000);

  it("throttles repeated customer PIN attempts", async () => {
    const identity = {
      id: ids.get("neighbor")!,
      role: "CUSTOMER",
      email: email("neighbor"),
      fullName: "Fictional neighbor",
      photoUrl: null,
    } as const;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        expect(verifyTransactionPin(identity, "000000")).rejects.toMatchObject({
          code: "INVALID_PIN",
        }),
      ),
    );
    await expect(
      verifyTransactionPin(identity, "651918"),
    ).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });
});
