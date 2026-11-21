import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashCredential } from "../modules/auth/credentials.ts";
import { getDatabase } from "./client.ts";
import { customerProfiles, users } from "./schema.ts";

const fixtures = [
  { email: "admin@bankbolt.example", fullName: "Raya Hasan", role: "ADMIN" },
  { email: "staff@bankbolt.example", fullName: "Imran Rahman", role: "STAFF" },
  {
    email: "customer@bankbolt.example",
    fullName: "Nila Karim",
    role: "CUSTOMER",
  },
] as const;

let database: ReturnType<typeof getDatabase> | undefined;
try {
  const password = z
    .string()
    .min(12)
    .max(128)
    .safeParse(process.env.DEMO_PASSWORD);
  if (!password.success) {
    throw new Error(
      "DEMO_PASSWORD must contain between 12 and 128 characters.",
    );
  }

  const records = await Promise.all(
    fixtures.map(async (fixture) => ({
      ...fixture,
      passwordHash: await hashCredential(password.data),
    })),
  );
  database = getDatabase();

  await database.transaction(async (transaction) => {
    for (const record of records) {
      await transaction
        .insert(users)
        .values(record)
        .onConflictDoNothing({ target: users.email });
      const [user] = await transaction
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.email, record.email));
      if (user.role !== record.role)
        throw new Error("A demo email already belongs to a different role.");

      if (user.role === "CUSTOMER") {
        await transaction
          .insert(customerProfiles)
          .values({
            userId: user.id,
            phone: "+1-202-555-0108",
            dateOfBirth: "1995-05-12",
            address: "BankBolt Demo Address, Dhaka",
            identityReference: "BANKBOLT-DEMO-CUSTOMER",
          })
          .onConflictDoNothing({ target: customerProfiles.userId });
      }
    }
  });

  console.log("Demo accounts are present. Existing records were preserved.");
} catch (error) {
  if (
    !database &&
    error instanceof Error &&
    error.message.startsWith("DEMO_PASSWORD")
  ) {
    console.error(error.message);
  } else {
    console.error(
      "Could not seed demo accounts. Check the target database, migrations, and fixture email ownership.",
    );
  }
  process.exitCode = 1;
} finally {
  await database?.$client.end();
}
