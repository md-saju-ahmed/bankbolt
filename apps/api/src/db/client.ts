import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for database access.");
  }

  const pool = new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });

  pool.on("error", () => {
    console.error(
      "BankBolt PostgreSQL pool encountered an idle connection error.",
    );
  });

  return drizzle({ client: pool, schema });
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDatabase() {
  database ??= createDatabase();
  return database;
}
