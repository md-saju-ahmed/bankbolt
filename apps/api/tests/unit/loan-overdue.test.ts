import { expect, it } from "vitest";
import { installmentAccrual } from "../../src/modules/loans/calculations.ts";

it("charges only overdue principal starting the next calendar day and labels day eight overdue", () => {
  const terms = { dueDate: "2024-02-28", principalPoisha: 365_000n };
  expect(installmentAccrual(terms, 1200, "2024-02-28")).toEqual({
    daysLate: 0,
    overdueInterestPoisha: 0n,
  });
  expect(installmentAccrual(terms, 1200, "2024-02-29")).toEqual({
    daysLate: 1,
    overdueInterestPoisha: 120n,
  });
  expect(installmentAccrual(terms, 1200, "2024-03-06")).toEqual({
    daysLate: 7,
    overdueInterestPoisha: 840n,
  });
  expect(installmentAccrual(terms, 1200, "2024-03-07")).toEqual({
    daysLate: 8,
    overdueInterestPoisha: 960n,
  });
  expect(installmentAccrual(terms, 1200, "2024-02-27")).toEqual({
    daysLate: 0,
    overdueInterestPoisha: 0n,
  });
});

it("rounds accumulated simple interest once per installment", () => {
  expect(
    installmentAccrual(
      { dueDate: "2024-01-01", principalPoisha: 1_000n },
      1200,
      "2024-01-04",
    ).overdueInterestPoisha,
  ).toBe(1n);
});
