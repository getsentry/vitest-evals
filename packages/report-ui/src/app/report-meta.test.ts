import { describe, expect, test } from "vitest";
import { FALLBACK_PRICING } from "./pricing";
import { readReportMeta } from "./report-meta";

describe("readReportMeta", () => {
  test("keeps a valid workspace root and pricing table", () => {
    expect(
      readReportMeta({
        workspaceRoot: "/repo",
        pricing: {
          source: "https://models.dev/api.json",
          models: [
            {
              id: "gemini-2.5-flash",
              inputPerMillionUsd: 0.3,
              outputPerMillionUsd: 2.5,
            },
          ],
        },
      }),
    ).toEqual({
      workspaceRoot: "/repo",
      rerunEnabled: false,
      pricing: {
        source: "https://models.dev/api.json",
        sources: FALLBACK_PRICING.sources,
        models: [
          {
            id: "gemini-2.5-flash",
            inputPerMillionUsd: 0.3,
            outputPerMillionUsd: 2.5,
          },
        ],
      },
    });
  });

  test("falls back when the payload is empty", () => {
    expect(readReportMeta({})).toEqual({
      rerunEnabled: false,
      pricing: FALLBACK_PRICING,
    });
  });

  test("enables rerun only when the server says so", () => {
    expect(readReportMeta({ rerunEnabled: true }).rerunEnabled).toBe(true);
    expect(readReportMeta({ rerunEnabled: "yes" }).rerunEnabled).toBe(false);
  });
});
