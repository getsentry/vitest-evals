import { describe, expect, test } from "vitest";
import { FALLBACK_PRICING } from "./pricing";
import { suggestBetterModel, suggestionLabel } from "./suggest-model";

describe("suggestBetterModel", () => {
  test("prefers a cheaper same-provider model that keeps capabilities", () => {
    const suggestion = suggestBetterModel("gemini-2.5-flash", FALLBACK_PRICING);
    expect(suggestion).toMatchObject({
      fromId: "gemini-2.5-flash",
      toId: "gemini-2.5-flash-lite",
      sameProvider: true,
    });
    expect(suggestionLabel(suggestion!)).toContain("gemini-2.5-flash-lite");
  });

  test("returns nothing when the model is already the cheap option", () => {
    expect(suggestBetterModel("gpt-4o-mini", FALLBACK_PRICING)).toBeUndefined();
  });
});
