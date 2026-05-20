import { completeSimple } from "@mariozechner/pi-ai";
import type { Model } from "@mariozechner/pi-ai";
import { beforeEach, expect, test, vi } from "vitest";
import { piAiJudgeHarness } from "./index";

vi.mock("@mariozechner/pi-ai", () => ({
  completeSimple: vi.fn(),
}));

const completeSimpleMock = vi.mocked(completeSimple);
const mockModel = {
  id: "claude-sonnet-4-5",
  name: "Claude Sonnet",
  api: "anthropic-messages",
  provider: "anthropic",
} as Model<"anthropic-messages">;

beforeEach(() => {
  completeSimpleMock.mockReset();
});

test("piAiJudgeHarness runs judge prompts through Pi AI", async () => {
  const signal = new AbortController().signal;
  const judgeHarness = piAiJudgeHarness({
    model: mockModel,
    temperature: 0,
    maxOutputTokens: 256,
  });
  completeSimpleMock.mockResolvedValueOnce({
    role: "assistant",
    content: [
      {
        type: "text",
        text: '{"choice":"C","rationale":"Matches."}',
      },
    ],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  });

  const result = await judgeHarness.run(
    {
      system: "Grade factuality.",
      prompt: "Compare the answers.",
      responseFormat: {
        type: "json",
      },
    },
    {
      metadata: {},
      signal,
      artifacts: {},
      setArtifact: () => {},
    },
  );

  expect(result.output).toBe('{"choice":"C","rationale":"Matches."}');
  expect(completeSimpleMock).toHaveBeenCalledWith(
    mockModel,
    {
      systemPrompt: expect.stringContaining("Return only valid JSON"),
      messages: [
        expect.objectContaining({
          role: "user",
          content: "Compare the answers.",
        }),
      ],
    },
    expect.objectContaining({
      temperature: 0,
      maxTokens: 256,
      signal,
    }),
  );
  expect(completeSimpleMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      systemPrompt: expect.stringContaining("Grade factuality."),
    }),
    expect.anything(),
  );
});
