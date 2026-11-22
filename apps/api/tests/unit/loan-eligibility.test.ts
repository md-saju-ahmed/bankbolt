import { expect, it } from "vitest";
import {
  fitsLoanIncome,
  isAdult,
} from "../../src/modules/loans/eligibility.ts";

it("accepts exactly 40 percent without rounding the income limit up", () => {
  expect(fitsLoanIncome(4n, 10n)).toBe(true);
  expect(fitsLoanIncome(4n, 9n)).toBe(false);
  expect(fitsLoanIncome(1n, 0n)).toBe(false);
  expect(
    fitsLoanIncome(3_600_000_000_000_000_000n, 9_000_000_000_000_000_000n),
  ).toBe(true);
});

it("checks the applicant's actual birthday in the local calendar", () => {
  expect(isAdult("2008-11-22", "2026-11-21")).toBe(false);
  expect(isAdult("2008-11-22", "2026-11-22")).toBe(true);
  expect(isAdult("2008-02-29", "2026-02-28")).toBe(false);
  expect(isAdult("2008-02-29", "2026-03-01")).toBe(true);
});
