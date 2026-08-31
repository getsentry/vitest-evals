import { describe, expect, test } from "vitest";
import { spawnVitest } from "./rerun-exec";

describe("spawnVitest", () => {
  test("kill stops an in-flight pnpm child", async () => {
    const started = Date.now();
    const spawned = spawnVitest(
      ["exec", "node", "-e", "setTimeout(() => {}, 60_000)"],
      process.cwd(),
      () => undefined,
    );
    spawned.kill();
    const result = await spawned.done;
    expect(result.exitCode).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(8_000);
  });
});
