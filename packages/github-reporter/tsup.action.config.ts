import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/action/main.ts",
  },
  format: ["cjs"],
  platform: "node",
  target: "node24",
  dts: false,
  splitting: false,
  sourcemap: false,
  clean: true,
  outDir: "../../github-reporter/dist/action",
  external: [],
});
