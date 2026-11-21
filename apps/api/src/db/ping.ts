import { sql } from "drizzle-orm";
import { getDatabase } from "./client.ts";

let database: ReturnType<typeof getDatabase> | undefined;

try {
  database = getDatabase();
  await database.execute(sql`select 1`);
  console.log("PostgreSQL connection verified.");
} catch {
  console.error(
    "Could not connect to PostgreSQL. Check DATABASE_URL and network access.",
  );
  process.exitCode = 1;
} finally {
  await database?.$client.end();
}
