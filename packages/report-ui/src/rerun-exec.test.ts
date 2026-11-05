import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { prepareRerun, spawnVitest } from "./rerun-exec";

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

describe("prepareRerun", () => {
  test("pins evals files to the evals vitest config", async () => {
    const root = await mkdtemp(join(tmpdir(), "vitest-evals-rerun-"));
    const file = join(root, "src", "__eval__", "refund.evals.ts");
    await mkdir(join(root, "src", "__eval__"), { recursive: true });
    await writeFile(file, "export {}");
    await writeFile(join(root, "vitest.evals.config.ts"), "export default {}");

    const prepared = await prepareRerun(
      { file, title: "refund (eligible)", label: "refund > eligible" },
      root,
    );
    expect(prepared).toMatchObject({
      ok: true,
      args: [
        "exec",
        "vitest",
        "run",
        "src/__eval__/refund.evals.ts",
        "-t",
        "refund \\(eligible\\)",
        "--config",
        "vitest.evals.config.ts",
      ],
    });
  });
});
