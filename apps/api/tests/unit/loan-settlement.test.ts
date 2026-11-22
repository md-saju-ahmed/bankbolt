import { expect, it } from "vitest";
import { calculateLoanSettlement } from "../../src/modules/loans/calculations.ts";

const schedule = [
  {
    dueDate: "2026-01-31",
    principalPoisha: 365_000n,
    interestPoisha: 12_000n,
    paidAt: null,
  },
  {
    dueDate: "2026-02-28",
    principalPoisha: 365_000n,
    interestPoisha: 9_000n,
    paidAt: null,
  },
  {
    dueDate: "2026-03-31",
    principalPoisha: 365_000n,
    interestPoisha: 5_000n,
    paidAt: null,
  },
];

it("charges due interest, the current period's earned portion, and overdue principal only", () => {
  const amounts = calculateLoanSettlement(
    schedule,
    "2025-12-31",
    1200,
    "2026-02-14",
  );
  expect(amounts).toEqual({
    principalPoisha: 1_095_000n,
    scheduledInterestPoisha: 16_500n,
    overdueInterestPoisha: 1_680n,
    amountPoisha: 1_113_180n,
  });
});

it("excludes paid installments and future interest on the first day of a new period", () => {
  const paid = [
    { ...schedule[0], paidAt: new Date("2026-01-31") },
    ...schedule.slice(1),
  ];
  expect(
    calculateLoanSettlement(paid, "2025-12-31", 1200, "2026-01-31"),
  ).toMatchObject({
    principalPoisha: 730_000n,
    scheduledInterestPoisha: 0n,
    overdueInterestPoisha: 0n,
  });
});
