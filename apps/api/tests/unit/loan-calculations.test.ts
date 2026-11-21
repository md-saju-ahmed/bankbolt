import { expect, it } from "vitest";
import { calculateLoanSchedule } from "../../src/modules/loans/calculations.ts";
import {
  annualLoanRateBps,
  loanCatalog,
  loanTypes,
  validLoanTerms,
} from "../../src/modules/loans/catalog.ts";

it("matches the agreed products and rate", () => {
  expect(annualLoanRateBps).toBe(1_200);
  expect(
    loanTypes.map((type) => {
      const terms = loanCatalog[type];
      return [
        type,
        terms.minPrincipalPoisha,
        terms.maxPrincipalPoisha,
        terms.minTermMonths,
        terms.maxTermMonths,
      ];
    }),
  ).toEqual([
    ["PERSONAL", 1_000_000n, 50_000_000n, 6, 36],
    ["EDUCATION", 2_000_000n, 80_000_000n, 6, 60],
    ["BUSINESS", 5_000_000n, 200_000_000n, 12, 60],
  ]);
});

it.each(loanTypes)(
  "accepts %s boundaries and rejects out-of-range terms",
  (type) => {
    const {
      minPrincipalPoisha,
      maxPrincipalPoisha,
      minTermMonths,
      maxTermMonths,
    } = loanCatalog[type];
    expect(validLoanTerms(type, minPrincipalPoisha, minTermMonths)).toBe(true);
    expect(validLoanTerms(type, maxPrincipalPoisha, maxTermMonths)).toBe(true);
    expect(validLoanTerms(type, minPrincipalPoisha - 1n, minTermMonths)).toBe(
      false,
    );
    expect(validLoanTerms(type, maxPrincipalPoisha + 1n, maxTermMonths)).toBe(
      false,
    );
    expect(validLoanTerms(type, minPrincipalPoisha, minTermMonths - 1)).toBe(
      false,
    );
    expect(validLoanTerms(type, maxPrincipalPoisha, maxTermMonths + 1)).toBe(
      false,
    );
    expect(validLoanTerms(type, minPrincipalPoisha, minTermMonths + 0.5)).toBe(
      false,
    );
  },
);

const example = {
  type: "PERSONAL",
  principalPoisha: 1_000_000n,
  termMonths: 6,
  disbursementDate: "2026-01-31",
} as const;

it("matches the exact reducing-balance EMI example and clears the last poisha", () => {
  const { emiPoisha, installments } = calculateLoanSchedule(example);
  expect(emiPoisha).toBe(172_548n);
  expect(
    installments.map(({ principalPoisha, interestPoisha }) => [
      principalPoisha,
      interestPoisha,
    ]),
  ).toEqual([
    [162_548n, 10_000n],
    [164_173n, 8_375n],
    [165_815n, 6_733n],
    [167_473n, 5_075n],
    [169_148n, 3_400n],
    [170_843n, 1_708n],
  ]);
  const last = installments.at(-1)!;
  expect(last.principalPoisha + last.interestPoisha).toBe(172_551n);
  expect(installments.map(({ dueDate }) => dueDate)).toEqual([
    "2026-02-28",
    "2026-03-31",
    "2026-04-30",
    "2026-05-31",
    "2026-06-30",
    "2026-07-31",
  ]);
});

it("rounds half a poisha up and anchors dates through a leap year", () => {
  const schedule = calculateLoanSchedule({
    ...example,
    principalPoisha: 1_000_050n,
    disbursementDate: "2023-12-31",
  });
  expect(schedule.installments[0].interestPoisha).toBe(10_001n);
  expect(
    schedule.installments.slice(0, 3).map(({ dueDate }) => dueDate),
  ).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
});

it.each(loanTypes)(
  "reconciles every supported %s term at both ends of the amount range",
  (type) => {
    const {
      minPrincipalPoisha,
      maxPrincipalPoisha,
      minTermMonths,
      maxTermMonths,
    } = loanCatalog[type];
    for (const principalPoisha of [minPrincipalPoisha, maxPrincipalPoisha]) {
      for (
        let termMonths = minTermMonths;
        termMonths <= maxTermMonths;
        termMonths++
      ) {
        const { emiPoisha, installments } = calculateLoanSchedule({
          ...example,
          type,
          principalPoisha,
          termMonths,
        });
        expect(installments).toHaveLength(termMonths);
        expect(
          installments.reduce((sum, row) => sum + row.principalPoisha, 0n),
        ).toBe(principalPoisha);
        expect(
          installments.every(
            (row) => row.principalPoisha > 0n && row.interestPoisha >= 0n,
          ),
        ).toBe(true);
        expect(
          installments
            .slice(0, -1)
            .every(
              (row) => row.principalPoisha + row.interestPoisha === emiPoisha,
            ),
        ).toBe(true);
      }
    }
  },
);

it.each(["2026-02-29", "2026-04-31", "invalid", "9999-12-31"])(
  "rejects invalid schedule date %s",
  (disbursementDate) => {
    expect(() =>
      calculateLoanSchedule({ ...example, disbursementDate }),
    ).toThrow(RangeError);
  },
);

it("rejects input outside the product terms before calculating", () => {
  expect(() => calculateLoanSchedule({ ...example, termMonths: 37 })).toThrow(
    RangeError,
  );
});
