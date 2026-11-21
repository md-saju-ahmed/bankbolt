import { describe, expect, it } from "vitest";
import { parsePort } from "../../src/config.ts";
import { isolatedDatabaseUrl } from "../support/test-database.ts";

describe("API port", () => {
  it("uses the default port and accepts a valid override", () => {
    expect(parsePort(undefined)).toBe(4000);
    expect(parsePort("4100")).toBe(4100);
  });

  it.each(["", "0", "65536", "4.5", "invalid"])("rejects %j", (value) => {
    expect(() => parsePort(value)).toThrow("PORT must be an integer");
  });
});

describe("test database isolation", () => {
  const loopback = "postgresql://bankbolt_test@127.0.0.1:55433/bankbolt_test";

  it("allows the local test database", () => {
    expect(isolatedDatabaseUrl(loopback)).toBe(loopback);
    const override = loopback.replace("55433", "55434");
    expect(isolatedDatabaseUrl(override, "55434")).toBe(override);
  });

  it.each([
    undefined,
    "postgresql://remote.example:55433/bankbolt_test",
    "postgresql://localhost:5432/bankbolt_test",
    "postgresql://localhost:55433/bankbolt_dev",
    `${loopback}?host=remote.example`,
  ])("rejects an unsafe or missing target", (value) => {
    expect(() => isolatedDatabaseUrl(value)).toThrow("TEST_DATABASE_URL");
  });
});
