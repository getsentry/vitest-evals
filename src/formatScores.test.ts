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
      "# Scorer C [0.5]

      # Scorer A [0.8]

      # Scorer B [1.0]"
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
        metadata: { rationale: "Incorrect answer", output: "Paris" },
      },
    ];

    const result = formatScores(scores);

    expect(result).toMatchInlineSnapshot(`
      "# Scorer C [0.5]

      ## Rationale

      Incorrect answer

      ## Response

      Paris

      # Scorer A [0.8]

      ## Rationale

      Missing some details

      # Scorer B [1.0]"
    `);
  });

  it("should handle null scores", () => {
    const scores = [
      { name: "Scorer A", score: null },
      { name: "Scorer B", score: 0.8 },
    ];

    const result = formatScores(scores);

    expect(result).toMatchInlineSnapshot(`
      "# Scorer A [0.0]

      # Scorer B [0.8]"
    `);
  });

  it("should format transcript outputs", () => {
    const scores = [
      {
        name: "Scorer A",
        score: 0.2,
        metadata: {
          rationale: "Image description was incorrect",
          output: [
            {
              role: "assistant",
              parts: [
                { type: "text", text: "A dog on a sofa." },
                {
                  type: "image",
                  image: "data:image/png;base64,abc",
                  mediaType: "image/png",
                },
              ],
            },
          ],
        },
      },
    ];

    const result = formatScores(scores);

    expect(result).toMatchInlineSnapshot(`
      "# Scorer A [0.2]

      ## Rationale

      Image description was incorrect

      ## Response

      ## assistant

      A dog on a sofa.

      [image image/png]"
    `);
  });
});
