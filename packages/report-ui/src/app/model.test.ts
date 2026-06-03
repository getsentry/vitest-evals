import { describe, expect, test } from "vitest";
import type { ReportWorkspace } from "@vitest-evals/core";
import {
  buildSpanTree,
  buildTranscript,
  caseToolCallCount,
  caseToolCalls,
  caseTotalTokens,
  filterReportCases,
  formatScore,
  scoreTone,
  summarizeWorkspace,
} from "./model";

const workspace: ReportWorkspace = {
  schemaVersion: 1,
  runs: [
    {
      id: "shard-a.json",
      source: "shard-a.json",
      status: "failed",
      startedAt: 1000,
      durationMs: 4500,
      totals: {
        total: 2,
        passed: 1,
        failed: 1,
        skipped: 0,
        evalTotal: 2,
        evalPassed: 1,
        evalFailed: 1,
      },
    },
  ],
  cases: [
    {
      id: "case-1",
      runId: "shard-a.json",
      source: "shard-a.json",
      file: "/repo/apps/demo/evals/refund.eval.ts",
      displayFile: "apps/demo/evals/refund.eval.ts",
      title: "rejects fraud",
      fullName: "refund agent rejects fraud",
      ancestorTitles: ["refund agent"],
      displayName: "refund agent > rejects fraud",
      status: "failed",
      durationMs: 42,
      failureMessages: ["Score: 0.20 below threshold: 1.00"],
      eval: {
        avgScore: 0.2,
        scores: [{ name: "StructuredOutputJudge", score: 0.2 }],
      },
      harness: {
        name: "pi-ai",
        run: {
          output: { status: "denied" },
          usage: {
            totalTokens: 1220,
            toolCalls: 1,
          },
          session: {
            messages: [
              {
                role: "assistant",
                toolCalls: [
                  {
                    name: "lookupInvoice",
                    durationMs: 6,
                  },
                ],
              },
            ],
          },
          traces: [
            {
              id: "trace-1",
              name: "pi-ai",
              spans: [
                {
                  id: "root",
                  traceId: "trace-1",
                  name: "run",
                  kind: "run",
                  startedAt: "2026-06-03T08:00:00.000Z",
                },
                {
                  id: "child",
                  traceId: "trace-1",
                  parentId: "root",
                  name: "lookupInvoice",
                  kind: "tool",
                  startedAt: "2026-06-03T08:00:01.000Z",
                  attributes: {
                    "gen_ai.tool.name": "lookupInvoice",
                    "gen_ai.tool.call.arguments": { invoiceId: "inv_123" },
                  },
                },
              ],
            },
          ],
          errors: [],
        },
      },
    },
    {
      id: "case-2",
      runId: "shard-a.json",
      source: "shard-a.json",
      file: "/repo/apps/demo/evals/refund.eval.ts",
      displayFile: "apps/demo/evals/refund.eval.ts",
      title: "approves eligible refund",
      fullName: "refund agent approves eligible refund",
      ancestorTitles: ["refund agent"],
      displayName: "refund agent > approves eligible refund",
      status: "passed",
      durationMs: 30,
      failureMessages: [],
      eval: {
        avgScore: 1,
        scores: [{ name: "StructuredOutputJudge", score: 1 }],
      },
    },
  ],
};

describe("summarizeWorkspace", () => {
  test("aggregates score, tokens, tools, and status counts", () => {
    expect(summarizeWorkspace(workspace)).toMatchObject({
      runCount: 1,
      caseCount: 2,
      passed: 1,
      failed: 1,
      averageScore: 0.6,
      totalTokens: 1220,
      toolCallCount: 1,
      durationMs: 4500,
    });
  });

  test("uses the wall-clock envelope for parallel runs", () => {
    expect(
      summarizeWorkspace({
        ...workspace,
        runs: [
          {
            ...workspace.runs[0]!,
            durationMs: 5000,
            id: "shard-a.json",
            source: "shard-a.json",
            startedAt: 1000,
          },
          {
            ...workspace.runs[0]!,
            durationMs: 3000,
            id: "shard-b.json",
            source: "shard-b.json",
            startedAt: 2000,
          },
        ],
      }).durationMs,
    ).toBe(5000);
  });

  test("falls back to summed durations for runs without start times", () => {
    expect(
      summarizeWorkspace({
        ...workspace,
        runs: [
          {
            id: "shard-a.json",
            source: "shard-a.json",
            status: "failed",
            durationMs: 5000,
            totals: workspace.runs[0]!.totals,
          },
          {
            id: "shard-b.json",
            source: "shard-b.json",
            status: "failed",
            durationMs: 3000,
            totals: workspace.runs[0]!.totals,
          },
        ],
      }).durationMs,
    ).toBe(8000);
  });
});

describe("filterReportCases", () => {
  test("filters by status, run, and search query", () => {
    expect(
      filterReportCases(workspace.cases, {
        status: "failed",
        runId: "shard-a.json",
        query: "fraud",
      }),
    ).toEqual([workspace.cases[0]]);
  });

  test("searches harness and judge names", () => {
    expect(
      filterReportCases(workspace.cases, {
        status: "all",
        runId: "all",
        query: "pi-ai",
      }),
    ).toEqual([workspace.cases[0]]);
  });
});

describe("case helpers", () => {
  test("returns captured tool calls and trace trees", () => {
    expect(caseToolCalls(workspace.cases[0]!)).toHaveLength(1);
    expect(caseTotalTokens(workspace.cases[0]!)).toBe(1220);
    expect(caseToolCallCount(workspace.cases[0]!)).toBe(1);
    expect(
      buildSpanTree(workspace.cases[0]!.harness?.run?.traces?.[0]?.spans ?? []),
    ).toMatchObject([
      {
        id: "root",
        nodeId: "root",
        children: [{ id: "child" }],
      },
    ]);
    expect(buildTranscript(workspace.cases[0]!.harness!.run!)).toMatchObject({
      events: [
        {
          arguments: { invoiceId: "inv_123" },
          kind: "tool",
          name: "lookupInvoice",
        },
      ],
      operations: [
        { name: "run", label: "Run" },
        {
          name: "lookupInvoice",
          label: "Tool",
          arguments: { invoiceId: "inv_123" },
        },
      ],
    });
  });

  test("formats scores for compact UI surfaces", () => {
    expect(formatScore(0.2)).toBe("20%");
    expect(scoreTone(1)).toBe("good");
    expect(scoreTone(0.7)).toBe("warn");
    expect(scoreTone(0.2)).toBe("bad");
  });

  test("preserves repeated trace messages as distinct turns", () => {
    const transcript = buildTranscript({
      errors: [],
      session: { messages: [] },
      usage: {},
      traces: [
        {
          spans: [
            {
              id: "model-1",
              kind: "model",
              name: "model",
              startedAt: "2026-06-03T08:00:00.000Z",
              attributes: {
                "gen_ai.input.messages": [{ role: "user", content: "yes" }],
                "gen_ai.output.messages": [
                  { role: "assistant", content: "Continue?" },
                ],
              },
            },
            {
              id: "model-2",
              kind: "model",
              name: "model",
              startedAt: "2026-06-03T08:00:01.000Z",
              attributes: {
                "gen_ai.input.messages": [
                  { role: "user", content: "yes" },
                  { role: "assistant", content: "Continue?" },
                  { role: "user", content: "yes" },
                ],
                "gen_ai.output.messages": [
                  { role: "assistant", content: "Done" },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(
      transcript.events
        .filter((event) => event.kind === "message")
        .map((event) => [event.role, event.content]),
    ).toEqual([
      ["user", "yes"],
      ["assistant", "Continue?"],
      ["user", "yes"],
      ["assistant", "Done"],
    ]);
  });
});
