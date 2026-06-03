import { describe, expect, test } from "vitest";
import { runVitestEvalsCli } from "./cli";

describe("runVitestEvalsCli", () => {
  test("prints top-level help", async () => {
    const stdout = createMemoryStdout();

    await runVitestEvalsCli(["--help"], { stdout });

    expect(stdout.output).toContain("Usage: vitest-evals <command>");
    expect(stdout.output).toContain("serve [json | dir | glob]");
  });

  test("prints serve help through the report UI runner", async () => {
    const stdout = createMemoryStdout();

    await runVitestEvalsCli(["serve", "--help"], { stdout });

    expect(stdout.output).toContain("Usage: vitest-evals serve");
    expect(stdout.output).toContain("--json <path>");
    expect(stdout.output).not.toContain("--input");
  });

  test("rejects unknown commands", async () => {
    await expect(runVitestEvalsCli(["wat"])).rejects.toThrow(
      "Unknown command: wat",
    );
  });
});

function createMemoryStdout() {
  return {
    output: "",
    write(chunk: string | Uint8Array) {
      this.output += String(chunk);
      return true;
    },
  };
}
