import { describe, expect, test } from "vitest";
import {
  flattenLiteLlm,
  flattenModelsDev,
  mergeModelRates,
} from "./pricing-catalog";

describe("flattenModelsDev", () => {
  test("prefers first-party google rates over reseller copies", () => {
    expect(
      flattenModelsDev({
        google: {
          models: {
            "gemini-2.5-flash": { cost: { input: 0.3, output: 2.5 } },
          },
        },
        openrouter: {
          models: {
            "gemini-2.5-flash": { cost: { input: 9, output: 9 } },
          },
        },
      }),
    ).toEqual([
      {
        id: "gemini-2.5-flash",
        provider: "google",
        inputPerMillionUsd: 0.3,
        outputPerMillionUsd: 2.5,
      },
    ]);
  });
});

describe("flattenLiteLlm", () => {
  test("converts per-token prices into per-million USD", () => {
    const [rate] = flattenLiteLlm({
      "gemini/gemini-2.0-flash": {
        input_cost_per_token: 1e-7,
        output_cost_per_token: 4e-7,
        cache_read_input_token_cost: 2.5e-8,
      },
    });
    expect(rate?.id).toBe("gemini-2.0-flash");
    expect(rate?.inputPerMillionUsd).toBeCloseTo(0.1);
    expect(rate?.outputPerMillionUsd).toBeCloseTo(0.4);
    expect(rate?.cacheReadPerMillionUsd).toBeCloseTo(0.025);
  });
});

describe("mergeModelRates", () => {
  test("keeps primary rows and fills missing LiteLLM models", () => {
    expect(
      mergeModelRates(
        [
          {
            id: "gemini-2.5-flash",
            inputPerMillionUsd: 0.3,
            outputPerMillionUsd: 2.5,
          },
        ],
        [
          {
            id: "gemini-2.5-flash",
            inputPerMillionUsd: 9,
            outputPerMillionUsd: 9,
          },
          {
            id: "gpt-4o-mini",
            inputPerMillionUsd: 0.15,
            outputPerMillionUsd: 0.6,
          },
        ],
      ),
    ).toEqual([
      {
        id: "gemini-2.5-flash",
        inputPerMillionUsd: 0.3,
        outputPerMillionUsd: 2.5,
      },
      {
        id: "gpt-4o-mini",
        inputPerMillionUsd: 0.15,
        outputPerMillionUsd: 0.6,
      },
    ]);
  });
});
