import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      { test: { name: "api", include: ["tests/api/**/*.test.ts"] } },
      {
        test: {
          name: "integration",
          fileParallelism: false,
          include: ["tests/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
