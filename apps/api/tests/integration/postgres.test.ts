import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { getDatabase } from "../../src/db/client.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

const migrations = { migrationsFolder: "./drizzle" };
let database: ReturnType<typeof getDatabase> | undefined;

beforeAll(() => {
  if (existsSync(".env.test")) {
    loadEnvFile(".env.test");
  }

  vi.stubEnv(
    "DATABASE_URL",
    isolatedDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.TEST_DB_PORT,
    ),
  );
  database = getDatabase();
});

afterAll(async () => {
  try {
    await database?.$client.end();
  } finally {
    vi.unstubAllEnvs();
  }
});

it("applies reviewed migrations once on real PostgreSQL", async () => {
  const db = getDatabase();
  expect(getDatabase()).toBe(db);
  await migrate(db, migrations);
  await migrate(db, migrations);

  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
  );
  expect(result.rows[0]?.count).toBe(readMigrationFiles(migrations).length);
});

it("rolls back an insert if a transaction fails", async () => {
  const connection = await getDatabase().$client.connect();
  const db = drizzle(connection);

  try {
    await db.execute(
      sql`create temporary table rollback_check (amount integer)`,
    );
    await expect(
      db.transaction(async (transaction) => {
        await transaction.execute(sql`insert into rollback_check values (100)`);
        throw new Error("Test rollback");
      }),
    ).rejects.toThrow("Test rollback");

    const result = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from rollback_check`,
    );
    expect(result.rows[0]?.count).toBe(0);
  } finally {
    connection.release(true);
  }
});
