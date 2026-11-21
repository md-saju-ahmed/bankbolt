import { describe, expect, it } from "vitest";
import { nonnegativePoisha, roundPoisha } from "../../src/lib/money.ts";

describe("poisha input", () => {
  it.each([
    ["0", 0n],
    ["0001", 1n],
    ["9007199254740993", 9_007_199_254_740_993n],
    ["9223372036854775807", 9_223_372_036_854_775_807n],
  ])("parses %s exactly", (input, expected) => {
    const amount = nonnegativePoisha.parse(input);
    expect(amount).toBe(expected);
    expect(JSON.stringify({ amount: amount.toString() })).toBe(
      `{"amount":"${expected}"}`,
    );
  });

  it.each([
    "",
    " 1",
    "1\n",
    "+1",
    "-1",
    "1.00",
    "1e2",
    "9223372036854775808",
    "00000000000000000001",
    100,
    null,
  ])("rejects %j", (input) => {
    expect(nonnegativePoisha.safeParse(input).success).toBe(false);
  });
});

describe("poisha rounding", () => {
  it.each([
    [0n, 10n, 0n],
    [4n, 10n, 0n],
    [5n, 10n, 1n],
    [16n, 10n, 2n],
    [1n, 3n, 0n],
    [2n, 3n, 1n],
    [-4n, 10n, 0n],
    [-15n, 10n, -2n],
    [25n, 5n, 5n],
    [90_071_992_547_409_935n, 10n, 9_007_199_254_740_994n],
  ])("rounds %s / %s to %s", (numerator, denominator, expected) => {
    expect(roundPoisha(numerator, denominator)).toBe(expected);
  });

  it.each([0n, -1n])("rejects denominator %s", (denominator) => {
    expect(() => roundPoisha(1n, denominator)).toThrow(RangeError);
  });
});
