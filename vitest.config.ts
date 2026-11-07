import { defineConfig } from "vitest/config";
export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    include: [
      "packages/**/*.test.ts",
      "services/**/*.test.ts",
      "integrations/**/*.test.ts",
      "workflows/cre/test/**/*.test.ts",
      "apps/web/**/*.test.tsx",
    ],
    exclude: ["**/*.integration.test.ts"],
    testTimeout: 10000,
  },
});
