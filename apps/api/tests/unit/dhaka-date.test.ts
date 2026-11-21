import { expect, it } from "vitest";
import { dhakaDate } from "../../src/lib/dhaka-date.ts";

it.each([
  ["2026-12-31T17:59:59.999Z", "2026-12-31"],
  ["2026-12-31T18:00:00.000Z", "2027-01-01"],
  ["2027-01-01T00:00:00.000+06:00", "2027-01-01"],
  ["2024-02-28T18:00:00.000Z", "2024-02-29"],
])("returns the Dhaka calendar date for %s", (instant, expected) => {
  expect(dhakaDate(new Date(instant))).toBe(expected);
});
