import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { dhakaDate } from "../lib/dhaka-date.ts";
import { hashCredential } from "../modules/auth/credentials.ts";
import { calculateLoanSchedule } from "../modules/loans/calculations.ts";
import type { getDatabase } from "./client.ts";
import {
  bankAccounts,
  cashRequests,
  customerProfiles,
  loanInstallments,
  loanReviewNotes,
  loans,
  transactionFlags,
  transactions,
  users,
} from "./schema.ts";

type SeedTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type SeedUser = Pick<
  typeof users.$inferInsert,
  "email" | "fullName" | "role" | "passwordHash"
>;
const openingReference = "6b88d583-ddcc-4d2a-a0fd-4ec733e9cb0b";

export async function seedPortfolio(
  tx: SeedTransaction,
  records: SeedUser[],
  pinHash: string,
) {
  const target = await tx.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  if (target.rows[0]?.name !== "bankbolt_demo") {
    throw new Error(
      "The portfolio seed requires the isolated bankbolt_demo database.",
    );
  }

  await tx.execute(sql`select pg_advisory_xact_lock(78015314)`);
  if (
    await tx.$count(transactions, eq(transactions.reference, openingReference))
  )
    return false;
  if (await tx.$count(users))
    throw new Error("The portfolio seed requires a fresh demo database.");

  const now = new Date();
  const [year, month] = dhakaDate(now).split("-").map(Number);
  const older = new Date(Date.UTC(year, month - 3, 1));
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const opening = new Date(older.getTime() - 172_800_000);

  const identities = await tx
    .insert(users)
    .values([
      ...records.map((record) => ({ ...record, createdAt: opening })),
      {
        email: "merchant@bankbolt.example",
        fullName: "Samira Noor",
        passwordHash: await hashCredential(
          randomBytes(32).toString("base64url"),
        ),
        role: "CUSTOMER",
        createdAt: opening,
      },
    ])
    .returning({ id: users.id, email: users.email, role: users.role });
  const admin = identities.find((user) => user.role === "ADMIN")!;
  const staff = identities.find((user) => user.role === "STAFF")!;
  const customer = identities.find(
    (user) => user.email === "customer@bankbolt.example",
  )!;
  const merchant = identities.find(
    (user) => user.email === "merchant@bankbolt.example",
  )!;
  const [owner, vendor] = await tx
    .insert(customerProfiles)
    .values([
      {
        userId: customer.id,
        phone: "+1-202-555-0108",
        dateOfBirth: "1995-05-12",
        address: "Fictional residence, Dhaka",
        identityReference: "BANKBOLT-DEMO-CUSTOMER",
        verificationStatus: "VERIFIED",
        verifiedBy: staff.id,
        verifiedAt: opening,
        pinHash,
      },
      {
        userId: merchant.id,
        phone: "+1-202-555-0110",
        dateOfBirth: "1992-09-17",
        address: "Fictional studio, Dhaka",
        identityReference: "BANKBOLT-DEMO-MERCHANT",
        verificationStatus: "VERIFIED",
        verifiedBy: staff.id,
        verifiedAt: opening,
      },
    ])
    .returning({ id: customerProfiles.id });

  const activeAccount = {
    status: "ACTIVE",
    createdAt: opening,
    activatedAt: opening,
    updatedAt: opening,
  } as const;
  const [savings, current, business] = await tx
    .insert(bankAccounts)
    .values([
      {
        ...activeAccount,
        customerId: owner.id,
        type: "SAVINGS",
        creationKey: randomUUID(),
      },
      {
        ...activeAccount,
        customerId: owner.id,
        type: "CURRENT",
        creationKey: randomUUID(),
      },
      {
        ...activeAccount,
        customerId: vendor.id,
        type: "BUSINESS",
        creationKey: randomUUID(),
        businessName: "Noor Studio",
      },
    ])
    .returning({ id: bankAccounts.id, customerId: bankAccounts.customerId });

  const balances = new Map(
    [savings, current, business].map(({ id }) => [id, 0n]),
  );
  async function post(entry: Omit<typeof transactions.$inferInsert, "status">) {
    if (entry.senderAccountId) {
      const balance =
        balances.get(entry.senderAccountId)! -
        entry.amountPoisha -
        (entry.feePoisha ?? 0n);
      if (balance < 0n)
        throw new Error("A demo posting would overdraw its source account.");
      balances.set(entry.senderAccountId, balance);
    }
    if (entry.receiverAccountId) {
      balances.set(
        entry.receiverAccountId,
        balances.get(entry.receiverAccountId)! + entry.amountPoisha,
      );
    }
    const [record] = await tx
      .insert(transactions)
      .values({ ...entry, status: "COMPLETED" })
      .returning({ id: transactions.id });
    return record.id;
  }

  const cashActivity = [
    {
      account: savings,
      type: "DEPOSIT",
      amountPoisha: 6_000_000n,
      date: older,
      description: "Opening savings deposit",
      reference: openingReference,
    },
    {
      account: current,
      type: "DEPOSIT",
      amountPoisha: 2_500_000n,
      date: older,
      description: "Opening current account deposit",
    },
    {
      account: business,
      type: "DEPOSIT",
      amountPoisha: 8_500_000n,
      date: older,
      description: "Opening studio deposit",
    },
    {
      account: savings,
      type: "WITHDRAWAL",
      amountPoisha: 450_000n,
      date: previous,
      description: "Cash withdrawal for home supplies",
    },
    {
      account: current,
      type: "DEPOSIT",
      amountPoisha: 1_200_000n,
      date: previous,
      description: "Monthly cash deposit",
    },
    {
      account: current,
      type: "WITHDRAWAL",
      amountPoisha: 250_000n,
      date: now,
      description: "Cash withdrawal for travel",
    },
  ] as const;
  const approvedRequests = await tx
    .insert(cashRequests)
    .values(
      cashActivity.map<typeof cashRequests.$inferInsert>((item) => ({
        accountId: item.account.id,
        customerId: item.account.customerId,
        type: item.type,
        amountPoisha: item.amountPoisha,
        description: item.description,
        createdAt: item.date,
        status: "APPROVED",
        reviewedBy: staff.id,
        reviewedAt: item.date,
      })),
    )
    .returning({ id: cashRequests.id, description: cashRequests.description });
  for (const item of cashActivity) {
    await post({
      reference: "reference" in item ? item.reference : undefined,
      cashRequestId: approvedRequests.find(
        (request) => request.description === item.description,
      )!.id,
      senderAccountId: item.type === "WITHDRAWAL" ? item.account.id : null,
      receiverAccountId: item.type === "DEPOSIT" ? item.account.id : null,
      type: item.type,
      amountPoisha: item.amountPoisha,
      description: item.description,
      createdAt: item.date,
      initiatedBy: staff.id,
    });
  }
  const pendingWithdrawalPoisha = 150_000n;
  await tx.insert(cashRequests).values([
    {
      accountId: savings.id,
      customerId: owner.id,
      type: "DEPOSIT",
      amountPoisha: 320_000n,
      description: "Cash deposit awaiting review",
    },
    {
      accountId: current.id,
      customerId: owner.id,
      type: "WITHDRAWAL",
      amountPoisha: pendingWithdrawalPoisha,
      fundsReserved: true,
      description: "Cash withdrawal awaiting review",
    },
  ]);

  await post({
    type: "FUND_TRANSFER",
    senderAccountId: savings.id,
    receiverAccountId: current.id,
    amountPoisha: 500_000n,
    description: "Budget transfer between own accounts",
    createdAt: previous,
    initiatedBy: customer.id,
    idempotencyKey: randomUUID(),
  });
  const flagged = await post({
    type: "FUND_TRANSFER",
    senderAccountId: current.id,
    receiverAccountId: business.id,
    amountPoisha: 780_000n,
    feePoisha: 1_000n,
    description: "Payment to Noor Studio",
    createdAt: now,
    initiatedBy: customer.id,
    idempotencyKey: randomUUID(),
  });
  await tx.insert(transactionFlags).values({
    transactionId: flagged,
    flaggedBy: staff.id,
    reason: "Confirm the recipient details for this simulated payment.",
  });

  const loanDefaults = {
    customerId: owner.id,
    disbursementAccountId: savings.id,
    type: "PERSONAL",
    requestedPrincipalPoisha: 2_400_000n,
    monthlyIncomePoisha: 6_500_000n,
    termMonths: 6,
    employmentStatus: "Employed",
  } as const;
  const schedule = calculateLoanSchedule({
    type: loanDefaults.type,
    principalPoisha: loanDefaults.requestedPrincipalPoisha,
    termMonths: loanDefaults.termMonths,
    disbursementDate: dhakaDate(older),
  }).installments;
  const first = schedule[0];
  const paidPoisha = first.principalPoisha + first.interestPoisha;
  const paidAt = new Date(`${first.dueDate}T12:00:00+06:00`);
  const [activeLoan] = await tx
    .insert(loans)
    .values({
      ...loanDefaults,
      status: "ACTIVE",
      description: "Home equipment financing",
      createdAt: opening,
      updatedAt: paidAt,
      reviewStartedAt: older,
      reviewStartedBy: staff.id,
      forwardedAt: older,
      forwardedBy: staff.id,
      decidedAt: older,
      decidedBy: admin.id,
      approvalReason: "Reviewed simulated application.",
      approvedPrincipalPoisha: loanDefaults.requestedPrincipalPoisha,
      remainingPrincipalPoisha:
        loanDefaults.requestedPrincipalPoisha - first.principalPoisha,
      disbursedAt: older,
    })
    .returning({ id: loans.id });
  await post({
    type: "LOAN_DISBURSEMENT",
    receiverAccountId: savings.id,
    loanId: activeLoan.id,
    amountPoisha: loanDefaults.requestedPrincipalPoisha,
    description: "Loan disbursement",
    createdAt: older,
    initiatedBy: admin.id,
  });
  const repaymentTransactionId = await post({
    type: "LOAN_REPAYMENT",
    senderAccountId: savings.id,
    loanId: activeLoan.id,
    amountPoisha: paidPoisha,
    description: "Loan installment 1",
    createdAt: paidAt,
    initiatedBy: customer.id,
  });
  await tx.insert(loanInstallments).values(
    schedule.map((installment) => ({
      ...installment,
      loanId: activeLoan.id,
      ...(installment.number === first.number
        ? { paidAt, paidAmountPoisha: paidPoisha, repaymentTransactionId }
        : {}),
    })),
  );

  const [forwarded] = await tx
    .insert(loans)
    .values({
      ...loanDefaults,
      disbursementAccountId: current.id,
      status: "UNDER_REVIEW",
      description: "Replace household appliances",
      reviewStartedAt: now,
      reviewStartedBy: staff.id,
      forwardedAt: now,
      forwardedBy: staff.id,
    })
    .returning({ id: loans.id });
  await tx.insert(loanReviewNotes).values({
    loanId: forwarded.id,
    authorId: staff.id,
    note: "Account and simulated income details reviewed.",
  });
  await tx.insert(loans).values([
    { ...loanDefaults, description: "Home office improvements" },
    {
      ...loanDefaults,
      description: "Earlier equipment request",
      status: "REJECTED",
      createdAt: older,
      updatedAt: previous,
      reviewStartedAt: previous,
      reviewStartedBy: staff.id,
      forwardedAt: previous,
      forwardedBy: staff.id,
      decidedAt: previous,
      decidedBy: admin.id,
      rejectionReason: "The simulated application lacked sufficient details.",
    },
  ]);

  for (const [id, balancePoisha] of balances) {
    await tx
      .update(bankAccounts)
      .set({
        balancePoisha,
        heldBalancePoisha: id === current.id ? pendingWithdrawalPoisha : 0n,
        updatedAt: now,
      })
      .where(eq(bankAccounts.id, id));
  }
  return true;
}
