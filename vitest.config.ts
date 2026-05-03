import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.eval.ts",
      "examples/**/*.test.ts",
      "examples/**/*.eval.ts",
      "apps/**/*.test.ts",
      "apps/**/*.eval.ts",
    ],
  },
});
