import { describe, test, expect, vi, beforeEach } from "vitest";
import { _evaluate, configure } from "./index";

// Mock the ai module
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";

const mockGenerateObject = vi.mocked(generateObject);

const mockModel = { modelId: "mock-model" } as any;

function makeContext() {
  return { task: { meta: {} as Record<string, any> } };
}

describe("evaluate", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
    configure({ model: mockModel });
  });

  test("sets eval metadata when task succeeds and scores", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        answer: "A",
        rationale: "The output fully meets the criterion",
      },
    } as any);

    const ctx = makeContext();
    await _evaluate(ctx, {
      task: async () => "Deploy completed successfully",
      criteria: "Response should confirm the deploy completed",
    });

    expect(ctx.task.meta.eval).toEqual({
      scores: [
        {
          score: 1.0,
          name: "evaluate",
          metadata: {
            rationale: "The output fully meets the criterion",
            answer: "A",
          },
        },
      ],
      avgScore: 1.0,
    });
  });

  test("fails when score is below threshold", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        answer: "E",
        rationale: "The criterion is not met",
      },
    } as any);

    const ctx = makeContext();
    await expect(
      _evaluate(ctx, {
        task: async () => "Something unrelated",
        criteria: "Response should confirm the deploy completed",
        threshold: 0.7,
      }),
    ).rejects.toThrow("Score: 0 (E) below threshold: 0.7");
  });

  test("sets score 0 and re-throws when task throws", async () => {
    const taskError = new Error("assertion failed: expected 1 to be 2");

    const ctx = makeContext();
    await expect(
      _evaluate(ctx, {
        task: async () => {
          throw taskError;
        },
        criteria: "anything",
      }),
    ).rejects.toThrow(taskError);

    expect(ctx.task.meta.eval).toEqual({
      scores: [
        {
          score: 0,
          name: "evaluate",
          metadata: {
            rationale: "Task failed: assertion failed: expected 1 to be 2",
          },
        },
      ],
      avgScore: 0,
    });

    // generateObject should not have been called
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  test("sets score 0 and re-throws when generateObject fails", async () => {
    const apiError = new Error("API rate limit exceeded");
    mockGenerateObject.mockRejectedValueOnce(apiError);

    const ctx = makeContext();
    await expect(
      _evaluate(ctx, {
        task: async () => "some output",
        criteria: "anything",
      }),
    ).rejects.toThrow(apiError);

    expect(ctx.task.meta.eval).toEqual({
      scores: [
        {
          score: 0,
          name: "evaluate",
          metadata: {
            rationale: "Judge failed: API rate limit exceeded",
          },
        },
      ],
      avgScore: 0,
    });
  });

  test("throws when no model is configured", async () => {
    configure({ model: undefined as any });

    const ctx = makeContext();
    await expect(
      _evaluate(ctx, {
        task: async () => "output",
        criteria: "anything",
      }),
    ).rejects.toThrow(
      "No model configured. Call configure({ model }) before using evaluate.",
    );
  });

  test("passes criteria and output to LLM prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { answer: "B", rationale: "Mostly met" },
    } as any);

    const ctx = makeContext();
    await _evaluate(ctx, {
      task: async () => "the task output",
      criteria: "must mention specific details",
      threshold: 0.5,
    });

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.prompt).toContain("the task output");
    expect(call.prompt).toContain("must mention specific details");
  });

  test("maps all answer choices to correct scores", async () => {
    const expectedScores: Record<string, number> = {
      A: 1.0,
      B: 0.75,
      C: 0.5,
      D: 0.25,
      E: 0.0,
    };

    for (const [answer, expectedScore] of Object.entries(expectedScores)) {
      mockGenerateObject.mockResolvedValueOnce({
        object: { answer, rationale: `Chose ${answer}` },
      } as any);

      const ctx = makeContext();
      await _evaluate(ctx, {
        task: async () => "output",
        criteria: "criteria",
        threshold: 0,
      });

      expect(ctx.task.meta.eval?.avgScore).toBe(expectedScore);
    }
  });

  test("uses default threshold of 1.0", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { answer: "B", rationale: "Mostly met" },
    } as any);

    const ctx = makeContext();
    await expect(
      _evaluate(ctx, {
        task: async () => "output",
        criteria: "criteria",
      }),
    ).rejects.toThrow("Score: 0.75 (B) below threshold: 1");
  });
});
