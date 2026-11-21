import { sql } from "drizzle-orm";
import { getDatabase } from "../../db/client.ts";
import { authAttempts } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";

const limits = { LOGIN: 8, PIN: 5 };

export async function reserveAttempt(
  purpose: keyof typeof limits,
  subject: string,
) {
  const limit = limits[purpose];
  const windowEnd = sql`now() + interval '15 minutes'`;
  const expired = sql`${authAttempts.resetsAt} <= now()`;
  const [result] = await getDatabase()
    .insert(authAttempts)
    .values({ purpose, subject, attempts: 1, resetsAt: windowEnd })
    .onConflictDoUpdate({
      target: [authAttempts.purpose, authAttempts.subject],
      set: {
        attempts: sql`case when ${expired} then 1 else least(${authAttempts.attempts} + 1, ${limit + 1}) end`,
        resetsAt: sql`case when ${expired} then ${windowEnd} else ${authAttempts.resetsAt} end`,
      },
    })
    .returning({ attempts: authAttempts.attempts });

  if (result.attempts > limit) {
    throw new ApiError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many attempts. Try again in 15 minutes.",
    );
  }
}
