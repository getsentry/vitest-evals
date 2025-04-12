import { describe, expect, it } from "vitest";
import { formatScores } from "./index";

describe("formatScores", () => {
  it("should format scores in descending order", () => {
    const scores = [
      { name: "Scorer A", score: 0.8 },
      { name: "Scorer B", score: 1.0 },
      { name: "Scorer C", score: 0.5 },
    ];

    const result = formatScores(scores);

    expect(result).toMatchInlineSnapshot(`
      "Scorer C [0.5]

      Scorer A [0.8]

      Scorer B [1.0]"
    `);
  });

  it("should include rationale for scores less than 1.0", () => {
    const scores = [
      {
        name: "Scorer A",
        score: 0.8,
        metadata: { rationale: "Missing some details" },
      },
      { name: "Scorer B", score: 1.0 },
      {
        name: "Scorer C",
        score: 0.5,
        metadata: { rationale: "Incorrect answer" },
      },
    ];

    const result = formatScores(scores);

    expect(result).toMatchInlineSnapshot(`
      "Scorer C [0.5]
      Rationale: Incorrect answer

      Scorer A [0.8]
      Rationale: Missing some details

      Scorer B [1.0]"
    `);
  });

  it("should handle null scores", () => {
    const scores = [
      { name: "Scorer A", score: null },
      { name: "Scorer B", score: 0.8 },
    ];

    const result = formatScores(scores);

    expect(result).toMatchInlineSnapshot(`
      "Scorer A [0.0]

      Scorer B [0.8]"
    `);
  });
});
