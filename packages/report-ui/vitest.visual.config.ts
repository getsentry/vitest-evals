import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Browser-driven scenes are slower and need a Chromium install, so they run
// separately from the root `pnpm test` suite.
export default defineConfig({
  plugins: [tsconfigPaths({ root: "../.." })],
  test: {
    include: ["visual/**/*.visual.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
