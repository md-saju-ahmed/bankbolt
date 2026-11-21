import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

if (existsSync(".env.local")) {
  loadEnvFile(".env.local");
}

const migrationUrl = process.env.DATABASE_MIGRATION_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(migrationUrl ? { dbCredentials: { url: migrationUrl } } : {}),
});
