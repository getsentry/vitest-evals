import { describe, expect, test } from "vitest";
import { wrapText } from "./index";

describe("wrapText", () => {
  test("should return the original text if it's shorter than the width", () => {
    const text = "This is a short text";
    expect(wrapText(text, 30)).toBe(text);
  });

  test("should wrap text at word boundaries", () => {
    const text = "This is a very long text that needs to be wrapped";
    const expected = "This is a very\nlong text that\nneeds to be\nwrapped";
    expect(wrapText(text, 15)).toBe(expected);
  });

  test("should handle empty string", () => {
    expect(wrapText("")).toBe("");
  });

  test("should handle null or undefined", () => {
    expect(wrapText(null as any)).toBe(null);
    expect(wrapText(undefined as any)).toBe(undefined);
  });

  test("should use default width of 80", () => {
    const text =
      "This is a very long text that needs to be wrapped to fit within an 80 character width.";
    const result = wrapText(text);
    const lines = result.split("\n");

    // Check that no line exceeds 80 characters
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  test("should handle text with multiple spaces", () => {
    const text = "This    has    multiple    spaces";
    const expected = "This has\nmultiple\nspaces";
    expect(wrapText(text, 10)).toBe(expected);
  });
});
