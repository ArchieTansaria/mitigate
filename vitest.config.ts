import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "services/**/*.test.ts",
      "integrations/**/*.test.ts",
      "workflows/cre/test/**/*.test.ts",
    ],
    exclude: ["**/*.integration.test.ts"],
    testTimeout: 10000,
  },
});
