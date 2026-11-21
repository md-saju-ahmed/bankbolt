import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "docs/",
    "**/.next/",
    "**/.turbo/",
    "**/.vercel/",
    "**/build/",
    "**/coverage/",
    "**/dist/",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    extends: [js.configs.recommended],
  },
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    extends: [tseslint.configs.recommended],
  },
);
