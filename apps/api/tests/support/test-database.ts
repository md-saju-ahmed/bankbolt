export function isolatedDatabaseUrl(
  value: string | undefined,
  expectedPort = "55433",
) {
  const url = value ? URL.parse(value) : null;

  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.port ||
    url.port !== expectedPort ||
    url.pathname !== "/bankbolt_test" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Set TEST_DATABASE_URL to the local bankbolt_test database on TEST_DB_PORT (default 55433), without URL options.",
    );
  }

  return url.toString();
}
