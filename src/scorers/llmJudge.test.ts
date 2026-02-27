import { describe, test, expect, vi, beforeEach } from "vitest";
import { LLMJudge, Factuality } from "./llmJudge";

// Mock the ai and zod modules
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

// Use actual zod since it's a dev dependency
import { generateObject } from "ai";

const mockGenerateObject = vi.mocked(generateObject);

// Minimal mock model that satisfies the type
const mockModel = { modelId: "mock-model" } as any;

describe("LLMJudge", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });
  test("returns score and rationale from LLM", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        score: 0.9,
        rationale: "The response correctly acknowledges the deploy",
      },
    } as any);

    const scorer = LLMJudge({
      model: mockModel,
      criteria: "Response should acknowledge the deploy",
    });

    const result = await scorer({
      input: "Deploy the latest release",
      output:
        "I've initiated the deployment of the latest release. Status: in progress.",
    });

    expect(result.score).toBe(0.9);
    expect(result.metadata?.rationale).toBe(
      "The response correctly acknowledges the deploy",
    );
  });

  test("passes criteria to the LLM prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { score: 1.0, rationale: "Perfect" },
    } as any);

    const criteria = "Must mention specific error codes";
    const scorer = LLMJudge({ model: mockModel, criteria });

    await scorer({
      input: "What errors occurred?",
      output: "Error 404 and Error 500 occurred",
    });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(criteria),
      }),
    );
  });

  test("includes input and output in prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { score: 0.5, rationale: "Partial match" },
    } as any);

    const scorer = LLMJudge({
      model: mockModel,
      criteria: "Be helpful",
    });

    await scorer({
      input: "the test input",
      output: "the test output",
    });

    const call =
      mockGenerateObject.mock.calls[
        mockGenerateObject.mock.calls.length - 1
      ][0];
    expect(call.prompt).toContain("the test input");
    expect(call.prompt).toContain("the test output");
  });

  test("returns score of 0 when LLM judges poorly", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        score: 0,
        rationale: "Output is completely irrelevant",
      },
    } as any);

    const scorer = LLMJudge({
      model: mockModel,
      criteria: "Must answer the question",
    });

    const result = await scorer({
      input: "What is 2+2?",
      output: "The weather is nice today",
    });

    expect(result.score).toBe(0);
    expect(result.metadata?.rationale).toContain("irrelevant");
  });
});

describe("Factuality", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });
  test("returns 1.0 for equivalent answers (C)", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        answer: "C",
        rationale: "Both answers state the same fact",
      },
    } as any);

    const scorer = Factuality({ model: mockModel });

    const result = await scorer({
      input: "What is the capital of France?",
      output: "The capital of France is Paris",
      expected: "Paris",
    });

    expect(result.score).toBe(1.0);
    expect(result.metadata?.answer).toBe("C");
  });

  test("returns 0.4 for subset answers (A)", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        answer: "A",
        rationale: "Submission only covers part of the expert answer",
      },
    } as any);

    const scorer = Factuality({ model: mockModel });

    const result = await scorer({
      input: "Describe the weather",
      output: "It's sunny",
      expected: "It's sunny with temperatures around 75F and low humidity",
    });

    expect(result.score).toBe(0.4);
    expect(result.metadata?.answer).toBe("A");
  });

  test("returns 0.6 for superset answers (B)", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        answer: "B",
        rationale: "Submission contains additional correct information",
      },
    } as any);

    const scorer = Factuality({ model: mockModel });

    const result = await scorer({
      input: "What happened?",
      output:
        "The deploy succeeded at 3pm and the metrics look healthy with 99.9% uptime",
      expected: "The deploy succeeded at 3pm",
    });

    expect(result.score).toBe(0.6);
    expect(result.metadata?.answer).toBe("B");
  });

  test("returns 0.0 for contradictory answers (D)", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        answer: "D",
        rationale: "Submission contradicts the expert answer",
      },
    } as any);

    const scorer = Factuality({ model: mockModel });

    const result = await scorer({
      input: "Did the deploy succeed?",
      output: "The deploy failed with errors",
      expected: "The deploy succeeded at 3pm",
    });

    expect(result.score).toBe(0.0);
    expect(result.metadata?.answer).toBe("D");
  });

  test("returns 1.0 for different but factual answers (E)", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        answer: "E",
        rationale: "Different wording but factually equivalent",
      },
    } as any);

    const scorer = Factuality({ model: mockModel });

    const result = await scorer({
      input: "When did it finish?",
      output: "Completed at 15:00",
      expected: "The deploy succeeded at 3pm",
    });

    expect(result.score).toBe(1.0);
    expect(result.metadata?.answer).toBe("E");
  });

  test("returns 1.0 when no expected answer is provided", async () => {
    const scorer = Factuality({ model: mockModel });

    const result = await scorer({
      input: "What happened?",
      output: "Something happened",
    });

    expect(result.score).toBe(1.0);
    expect(result.metadata?.rationale).toBe("No expected answer provided");
    // Should not call generateObject when there's no expected answer
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  test("includes input, expected, and output in prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { answer: "C", rationale: "Match" },
    } as any);

    const scorer = Factuality({ model: mockModel });

    await scorer({
      input: "the question",
      output: "the submission",
      expected: "the expert answer",
    });

    const call =
      mockGenerateObject.mock.calls[
        mockGenerateObject.mock.calls.length - 1
      ][0];
    expect(call.prompt).toContain("the question");
    expect(call.prompt).toContain("the submission");
    expect(call.prompt).toContain("the expert answer");
  });
});
