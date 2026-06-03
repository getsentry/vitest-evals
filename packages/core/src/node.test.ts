import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { VitestJsonReport } from "./index";
import {
  readReportWorkspace,
  readVitestJsonReportFile,
  resolveReportFiles,
} from "./node";

const sampleJson: VitestJsonReport = {
  numFailedTests: 0,
  numPassedTests: 1,
  numPendingTests: 0,
  numTodoTests: 0,
  numTotalTests: 1,
  startTime: 1000,
  success: true,
  testResults: [
    {
      name: "/repo/apps/demo/evals/refund.eval.ts",
      status: "passed",
      message: "",
      startTime: 1000,
      endTime: 1200,
      assertionResults: [
        {
          ancestorTitles: ["refund agent"],
          fullName: "refund agent approves eligible refund",
          title: "approves eligible refund",
          status: "passed",
          duration: 20,
          failureMessages: [],
          meta: {
            eval: {
              avgScore: 1,
              scores: [{ name: "StructuredOutputJudge", score: 1 }],
            },
          },
        },
      ],
    },
  ],
};

describe("resolveReportFiles", () => {
  test("resolves result globs relative to the workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-core-"));
    const resultsDirectory = join(directory, "eval-results");
    await mkdir(resultsDirectory);
    await writeFile(join(resultsDirectory, "one.json"), "{}");
    await writeFile(join(resultsDirectory, "two.json"), "{}");
    await writeFile(join(resultsDirectory, "notes.txt"), "");

    await expect(
      resolveReportFiles(["eval-results/*.json"], {
        cwd: directory,
      }),
    ).resolves.toEqual([
      join(resultsDirectory, "one.json"),
      join(resultsDirectory, "two.json"),
    ]);
  });

  test("resolves directories to JSON result files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-core-"));
    const resultsDirectory = join(directory, "eval-results");
    const shardDirectory = join(resultsDirectory, "shard-a");
    await mkdir(shardDirectory, { recursive: true });
    await writeFile(join(resultsDirectory, "one.json"), "{}");
    await writeFile(join(shardDirectory, "two.JSON"), "{}");
    await writeFile(join(resultsDirectory, "notes.txt"), "");

    await expect(
      resolveReportFiles(["eval-results"], {
        cwd: directory,
      }),
    ).resolves.toEqual([
      join(resultsDirectory, "one.json"),
      join(shardDirectory, "two.JSON"),
    ]);
  });

  test("treats bracket characters as literal path characters", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-core-"));
    const resultFile = join(directory, "eval-results[1].json");
    await writeFile(resultFile, "{}");

    await expect(
      resolveReportFiles(["eval-results[1].json"], {
        cwd: directory,
      }),
    ).resolves.toEqual([resultFile]);
  });
});

describe("readVitestJsonReportFile", () => {
  test("includes the result filename when JSON parsing fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-core-"));
    const resultFile = join(directory, "broken.json");
    await writeFile(resultFile, "{");

    await expect(readVitestJsonReportFile(resultFile)).rejects.toThrow(
      `Failed to read eval result file ${resultFile}`,
    );
  });
});

describe("readReportWorkspace", () => {
  test("reads multiple result files into a collected workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-core-"));
    const first = join(directory, "one.json");
    const second = join(directory, "two.json");
    await writeFile(first, JSON.stringify(sampleJson));
    await writeFile(second, JSON.stringify(sampleJson));

    const { resultFiles, workspace } = await readReportWorkspace(["*.json"], {
      cwd: directory,
      workspace: "/repo",
    });

    expect(resultFiles).toEqual([first, second]);
    expect(workspace.runs).toHaveLength(2);
    expect(workspace.runs.map((run) => run.source)).toEqual([
      "one.json",
      "two.json",
    ]);
    expect(workspace.cases).toHaveLength(2);
    expect(workspace.cases[0]?.displayFile).toBe(
      "apps/demo/evals/refund.eval.ts",
    );
  });

  test("does not mutate JSON reports while collecting workspaces", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-evals-core-"));
    const resultFile = join(directory, "one.json");
    const rawJson = JSON.stringify(sampleJson, null, 2);
    await writeFile(resultFile, rawJson);

    await readReportWorkspace([resultFile], { workspace: "/repo" });

    await expect(readFile(resultFile, "utf8")).resolves.toBe(rawJson);
  });
});
