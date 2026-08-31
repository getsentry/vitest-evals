import { describe, expect, test } from "vitest";
import { parseFailureMessage } from "./failure";

describe("parseFailureMessage", () => {
  test("splits an assertion error into headline, diff, and stack", () => {
    expect(
      parseFailureMessage(
        [
          "AssertionError: Score: 0.75 below threshold: 0.80",
          "",
          "- Expected",
          "+ Received",
          "",
          "- 0.80",
          "+ 0.75",
          "    at Module.scoreThreshold (score.ts:10:5)",
          "    at Object.<anonymous> (eval.ts:22:3)",
        ].join("\n"),
      ),
    ).toEqual({
      name: "AssertionError",
      headline: "Score: 0.75 below threshold: 0.80",
      body: "",
      stack: [
        "at Module.scoreThreshold (score.ts:10:5)",
        "    at Object.<anonymous> (eval.ts:22:3)",
      ].join("\n"),
      diffLines: [
        { type: "context", text: "- Expected" },
        { type: "context", text: "+ Received" },
        { type: "remove", text: "0.80" },
        { type: "add", text: "0.75" },
      ],
    });
  });

  test("keeps unnamed messages and leftover body text", () => {
    expect(parseFailureMessage("expected approved, received denied")).toEqual({
      name: "Error",
      headline: "expected approved, received denied",
      body: "",
      stack: undefined,
      diffLines: [],
    });

    expect(
      parseFailureMessage("Error: boom\nmodel returned unstructured output"),
    ).toMatchObject({
      name: "Error",
      headline: "boom",
      body: "model returned unstructured output",
    });
  });
});
