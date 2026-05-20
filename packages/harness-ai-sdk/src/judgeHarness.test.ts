import { generateObject, generateText, jsonSchema } from "ai";
import type { LanguageModel } from "ai";
import { beforeEach, expect, test, vi } from "vitest";
import { aiSdkJudgeHarness } from "./index";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  jsonSchema: vi.fn((schema) => ({ jsonSchema: schema })),
}));

const generateObjectMock = vi.mocked(generateObject);
const generateTextMock = vi.mocked(generateText);
const jsonSchemaMock = vi.mocked(jsonSchema);
const mockModel = "judge-model" as unknown as LanguageModel;

beforeEach(() => {
  generateObjectMock.mockReset();
  generateTextMock.mockReset();
  jsonSchemaMock.mockClear();
});

test("aiSdkJudgeHarness uses generateObject for JSON response formats", async () => {
  const signal = new AbortController().signal;
  const judgeHarness = aiSdkJudgeHarness({
    model: mockModel,
    temperature: 0,
    maxOutputTokens: 256,
  });
  const schema = {
    type: "object",
    properties: {
      choice: {
        enum: ["A", "B"],
      },
    },
  };
  generateObjectMock.mockResolvedValueOnce({
    object: {
      choice: "A",
    },
  } as any);

  const result = await judgeHarness.run(
    {
      system: "Grade factuality.",
      prompt: "Compare the answers.",
      responseFormat: {
        type: "json",
        schema,
      },
    },
    {
      metadata: {},
      signal,
      artifacts: {},
      setArtifact: () => {},
    },
  );

  expect(result.output).toEqual({ choice: "A" });
  expect(jsonSchemaMock).toHaveBeenCalledWith(schema);
  expect(generateObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      model: mockModel,
      system: "Grade factuality.",
      prompt: "Compare the answers.",
      temperature: 0,
      maxOutputTokens: 256,
      abortSignal: signal,
      schema: expect.objectContaining({
        jsonSchema: schema,
      }),
    }),
  );
  expect(generateTextMock).not.toHaveBeenCalled();
});

test("aiSdkJudgeHarness uses generateText without a JSON schema", async () => {
  const judgeHarness = aiSdkJudgeHarness({
    model: mockModel,
    name: "test-judge",
  });
  generateTextMock.mockResolvedValueOnce({
    text: "plain verdict",
  } as any);

  const result = await judgeHarness.run(
    {
      prompt: "Grade this.",
      responseFormat: {
        type: "json",
      },
    },
    {
      metadata: {},
      artifacts: {},
      setArtifact: () => {},
    },
  );

  expect(judgeHarness.name).toBe("test-judge");
  expect(result.output).toBe("plain verdict");
  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      model: mockModel,
      prompt: "Grade this.",
      system: expect.stringContaining("Return only valid JSON"),
    }),
  );
  expect(generateObjectMock).not.toHaveBeenCalled();
});
