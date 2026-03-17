import { describe, expect, test, vi } from "vitest";
import { describeEval, ToolCallScorer } from "./index";
import {
  formatEvalValue,
  getTaskInput,
  normalizeScorerPayload,
  type EvalMessage,
} from "./messages";

const multimodalInput: EvalMessage[] = [
  {
    role: "system",
    parts: [{ type: "text", text: "Answer concisely." }],
  },
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

const multimodalOutput: EvalMessage[] = [
  {
    role: "assistant",
    parts: [{ type: "text", text: "A cat sitting on a chair." }],
  },
];

describe("message normalization", () => {
  test("toEval passes full message chains to scorers", async () => {
    const scorer = vi.fn(async (opts) => {
      expect(opts.input).toBe("Answer concisely.\nDescribe this image");
      expect(opts.output).toBe("A cat sitting on a chair.");
      expect(opts.inputMessages).toEqual(multimodalInput);
      expect(opts.outputMessages).toEqual(multimodalOutput);
      expect(opts.messages).toEqual([...multimodalInput, ...multimodalOutput]);
      return { score: 1 };
    });

    const task = vi.fn(async (input) => {
      expect(input).toEqual(multimodalInput);
      return { messages: multimodalOutput };
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

  test("rejects eval cases that define both input and messages", () => {
    expect(() =>
      getTaskInput("hello", [
        { role: "user", parts: [{ type: "text", text: "world" }] },
      ]),
    ).toThrow(
      "Each eval case must define exactly one of `input` or `messages`.",
    );
  });

  test("rejects task outputs that define both result and messages", () => {
    expect(() =>
      normalizeScorerPayload("hello", {
        result: "hi",
        messages: [
          { role: "assistant", parts: [{ type: "text", text: "hi" }] },
        ],
      } as any),
    ).toThrow(
      "Task results must define exactly one of `result` or `messages`.",
    );
  });

  test("formats transcripts safely for debug output", () => {
    expect(formatEvalValue(multimodalInput)).toMatchInlineSnapshot(`
      "## system

      Answer concisely.

      ## user

      Describe this image

      [image image/png]"
    `);
  });
});

describeEval("message chain scorer payload", {
  data: async () => [
    {
      name: "passes full chains through describeEval",
      messages: multimodalInput,
    },
  ],
  task: async (input) => {
    expect(input).toEqual(multimodalInput);
    return { messages: multimodalOutput };
  },
  scorers: [
    async (opts) => {
      expect(opts.inputMessages).toEqual(multimodalInput);
      expect(opts.outputMessages).toEqual(multimodalOutput);
      expect(opts.messages).toEqual([...multimodalInput, ...multimodalOutput]);
      expect(opts.output).toBe("A cat sitting on a chair.");
      return { score: 1 };
    },
  ],
});

describeEval("derived tool calls from message parts", {
  data: async () => [
    {
      name: "tool calls are derived without an explicit toolCalls array",
      input: "What is the weather in Seattle?",
      expectedTools: [
        { name: "getWeather", arguments: { location: "Seattle" } },
      ],
    },
  ],
  task: async () => ({
    messages: [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolName: "getWeather",
            toolCallId: "call-1",
            input: { location: "Seattle" },
          },
        ],
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolName: "getWeather",
            toolCallId: "call-1",
            output: { temperature: 72 },
          },
        ],
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "It is 72F in Seattle." }],
      },
    ],
  }),
  scorers: [ToolCallScorer()],
});
