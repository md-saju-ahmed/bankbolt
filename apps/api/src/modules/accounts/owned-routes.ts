import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import { bankAccounts, customerProfiles } from "../../db/schema.ts";
import { ApiError } from "../../errors.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import { accountView } from "../onboarding/service.ts";
import { pages } from "../onboarding/validation.ts";
import { financialRestriction } from "./eligibility.ts";
import { createStatement, statementDates } from "./statement.ts";

export const ownedAccountsRouter = Router();
ownedAccountsRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
ownedAccountsRouter.use(requireAuth, requireRole("CUSTOMER"));

function scopedQuery(userId: string) {
  return getDatabase()
    .select({ account: bankAccounts })
    .from(bankAccounts)
    .innerJoin(
      customerProfiles,
      eq(customerProfiles.id, bankAccounts.customerId),
    )
    .where(eq(customerProfiles.userId, userId));
}

function ownedView({ account }: { account: typeof bankAccounts.$inferSelect }) {
  return {
    ...accountView(account),
    restriction: financialRestriction(account.status),
  };
}

ownedAccountsRouter.get("/", async (request, response) => {
  const { page } = pages.parse(request.query);
  const rows = await scopedQuery(currentIdentity(request).id)
    .orderBy(desc(bankAccounts.createdAt), desc(bankAccounts.id))
    .limit(21)
    .offset((page - 1) * 20);
  response.json({
    accounts: rows.slice(0, 20).map(ownedView),
    hasNextPage: rows.length > 20,
  });
});

ownedAccountsRouter.get("/:accountId", async (request, response) => {
  const accountId = z.uuid().parse(request.params.accountId);
  const [row] = await getDatabase()
    .select({ account: bankAccounts })
    .from(bankAccounts)
    .innerJoin(
      customerProfiles,
      eq(customerProfiles.id, bankAccounts.customerId),
    )
    .where(
      and(
        eq(customerProfiles.userId, currentIdentity(request).id),
        eq(bankAccounts.id, accountId),
      ),
    );
  if (!row) throw new ApiError(404, "NOT_FOUND", "Bank account not found.");
  response.json({ account: ownedView(row) });
});

ownedAccountsRouter.get("/:accountId/statement", async (request, response) => {
  const accountId = z.uuid().parse(request.params.accountId).toLowerCase();
  const dates = statementDates.parse(request.query);
  const { filename, csv } = await createStatement(
    currentIdentity(request).id,
    accountId,
    dates,
  );
  response.attachment(filename).type("text/csv").send(csv);
});
