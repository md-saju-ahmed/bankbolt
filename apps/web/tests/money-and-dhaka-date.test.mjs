import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatTaka,
  parseTakaInput,
  takaInput,
} from "../src/features/accounts/account-display.ts";
import { formatDhakaTimestamp } from "../src/lib/dhaka-date.ts";

test("converts BDT form input into exact poisha strings", () => {
  assert.equal(parseTakaInput("0"), "0");
  assert.equal(parseTakaInput(" 12.3 "), "1230");
  assert.equal(parseTakaInput("0.01"), "1");
  assert.equal(parseTakaInput("90071992547409.93"), "9007199254740993");
  assert.equal(parseTakaInput("92233720368547758.07"), "9223372036854775807");
});

test("rejects invalid amounts and amounts over PostgreSQL bigint range", () => {
  for (const amount of ["", "-1", "1.001", "1e2", "1,000", "৳10", "1."]) {
    assert.throws(() => parseTakaInput(amount), /up to two decimal places/);
  }
  assert.throws(
    () => parseTakaInput("92233720368547758.08"),
    /Enter a smaller BDT amount/,
  );
});

test("formats BDT with two decimals, exact grouping, and an optional sign", () => {
  assert.equal(takaInput("9223372036854775807"), "92233720368547758.07");
  assert.equal(takaInput("-101"), "-1.01");
  assert.equal(formatTaka("0"), "৳0.00");
  assert.equal(formatTaka("12458000"), "৳1,24,580.00");
  assert.equal(formatTaka("9007199254740993"), "৳9,00,71,99,25,47,409.93");
  assert.equal(formatTaka("-1"), "−৳0.01");
});

test("formats API instants in Dhaka across midnight regardless of offset", () => {
  const utc = new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const before = formatDhakaTimestamp("2026-12-31T17:59:59.999Z");
  const after = formatDhakaTimestamp("2026-12-31T18:00:00.000Z");
  assert.equal(before, utc.format(new Date("2026-12-31T23:59:59.999Z")));
  assert.equal(after, utc.format(new Date("2027-01-01T00:00:00.000Z")));
  assert.equal(after, formatDhakaTimestamp("2027-01-01T00:00:00+06:00"));
});
