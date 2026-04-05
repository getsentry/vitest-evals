import { describe, expect, test, vi } from "vitest";
import { describeEval, ToolCallScorer } from "./index";
import {
  formatEvalValue,
  getTaskInput,
  normalizeScorerPayload,
  type Transcript,
} from "./messages";

const multimodalInput: Transcript = [
  {
    role: "user",
    parts: [
      { type: "text", text: "Describe this image" },
      {
        type: "image",
        image: "data:image/png;base64,abc123",
        mediaType: "image/png",
      },
    ],
  },
];

const multimodalOutput: Transcript = [
  {
    role: "assistant",
    parts: [{ type: "text", text: "A cat sitting on a chair." }],
  },
];

describe("transcript normalization", () => {
  test("toEval passes a combined transcript to scorers", async () => {
    const scorer = vi.fn(async (opts) => {
      expect(opts.input).toBe("Describe this image");
      expect(opts.output).toBe("A cat sitting on a chair.");
      expect(opts.transcript).toEqual([
        ...multimodalInput,
        ...multimodalOutput,
      ]);
      return { score: 1 };
    });

    const task = vi.fn(async (input) => {
      expect(input).toEqual(multimodalInput);
      return { transcript: multimodalOutput };
    });

    await expect(multimodalInput).toEval(
      { expected: "cat" },
      task,
      scorer,
      1.0,
    );

    expect(task).toHaveBeenCalledOnce();
    expect(scorer).toHaveBeenCalledOnce();
  });

  test("rejects eval cases that define both input and transcript", () => {
    expect(() =>
      getTaskInput("hello", [
        { role: "user", parts: [{ type: "text", text: "world" }] },
      ]),
    ).toThrow(
      "Each eval case must define exactly one of `input` or `transcript`.",
    );
  });

  test("rejects task outputs without a transcript", () => {
    expect(() =>
      normalizeScorerPayload("hello", { messages: [] } as any),
    ).toThrow(
      "Task output must be either a string or an object with `transcript`.",
    );
  });

  test("formats transcripts safely for debug output", () => {
    expect(formatEvalValue(multimodalInput)).toMatchInlineSnapshot(`
      "## user

      Describe this image

      [image image/png]"
    `);
  });
});

describeEval("transcript scorer payload", {
  data: async () => [
    {
      name: "passes transcript through describeEval",
      transcript: multimodalInput,
    },
  ],
  task: async (input) => {
    expect(input).toEqual(multimodalInput);
    return { transcript: multimodalOutput };
  },
  scorers: [
    async (opts) => {
      expect(opts.transcript).toEqual([
        ...multimodalInput,
        ...multimodalOutput,
      ]);
      expect(opts.output).toBe("A cat sitting on a chair.");
      return { score: 1 };
    },
  ],
});

describeEval("explicit tool call metadata", {
  data: async () => [
    {
      name: "tool calls are passed separately from the transcript",
      input: "What is the weather in Seattle?",
      expectedTools: [
        { name: "getWeather", arguments: { location: "Seattle" } },
      ],
    },
  ],
  task: async () => ({
    transcript: [
      {
        role: "assistant",
        parts: [{ type: "text", text: "It is 72F in Seattle." }],
      },
    ],
    toolCalls: [
      {
        name: "getWeather",
        arguments: { location: "Seattle" },
        result: { temperature: 72 },
      },
    ],
  }),
  scorers: [ToolCallScorer()],
});
