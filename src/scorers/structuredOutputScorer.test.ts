import { describe, test, expect, vi } from "vitest";
import "../index"; // Import to register the toEval matcher
import { StructuredOutputScorer } from "./structuredOutputScorer";

describe("StructuredOutputScorer", () => {
  describe("basic functionality", () => {
    test("scores valid JSON output with all expected fields", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          name: "test",
          value: 42,
          tags: ["a", "b"],
        }),
        expected: {
          name: "test",
          value: 42,
          tags: ["a", "b"],
        },
      });

      expect(result.score).toBe(1.0);
      expect(result.metadata?.rationale).toBe("All expected fields match");
    });

    test("fails on invalid JSON", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: "not valid json",
        expected: { foo: "bar" },
      });

      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain(
        "Failed to parse output as JSON",
      );
    });

    test("accepts valid JSON when no expected fields specified", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({ any: "data" }),
        expected: {},
      });

      expect(result.score).toBe(1.0);
      expect(result.metadata?.rationale).toBe(
        "Valid JSON output (no expected fields specified)",
      );
    });

    test("fails when output contains error field", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          error: "Something went wrong",
          data: null,
        }),
        expected: { data: "test" },
      });

      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toBe(
        "Output contains error: Something went wrong",
      );
    });
  });

  describe("strict matching (default)", () => {
    test("requires exact matches for all fields", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          name: "Test", // Wrong case
          value: 42,
        }),
        expected: {
          name: "test",
          value: 42,
        },
      });

      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain(
        "Missing required fields: name",
      );
    });

    test("handles nested objects strictly", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          config: {
            host: "localhost",
            port: 8080,
          },
        }),
        expected: {
          config: {
            host: "localhost",
            port: 8081, // Different port
          },
        },
      });

      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain(
        "Missing required fields: config",
      );
    });

    test("allows extra fields by default", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          name: "test",
          value: 42,
          extra: "field",
        }),
        expected: {
          name: "test",
          value: 42,
        },
      });

      expect(result.score).toBe(1.0);
      expect(result.metadata?.rationale).toBe(
        "All expected fields match (plus extra fields: extra)",
      );
    });
  });

  describe("fuzzy matching", () => {
    test("matches case-insensitive strings", async () => {
      const scorer = StructuredOutputScorer({ match: "fuzzy" });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          name: "TEST",
          status: "Active",
        }),
        expected: {
          name: "test",
          status: "active",
        },
      });

      expect(result.score).toBe(1.0);
    });

    test("matches numbers with tolerance", async () => {
      const scorer = StructuredOutputScorer({ match: "fuzzy" });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          price: 99.99,
          quantity: 1000.1,
        }),
        expected: {
          price: 100.0, // Within 0.1% tolerance
          quantity: 1000,
        },
      });

      expect(result.score).toBe(1.0);
    });

    test("matches arrays regardless of order", async () => {
      const scorer = StructuredOutputScorer({ match: "fuzzy" });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          tags: ["b", "c", "a"],
        }),
        expected: {
          tags: ["a", "b", "c"],
        },
      });

      expect(result.score).toBe(1.0);
    });

    test("matches regex patterns", async () => {
      const scorer = StructuredOutputScorer({ match: "fuzzy" });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          query: "user.email:john@example.com",
          filter: "status:active AND type:premium",
        }),
        expected: {
          query: /user\.email:.*@example\.com/,
          filter: /status:active/,
        },
      });

      expect(result.score).toBe(1.0);
    });

    test("allows type coercion", async () => {
      const scorer = StructuredOutputScorer({ match: "fuzzy" });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          count: "42",
          enabled: "true",
        }),
        expected: {
          count: 42,
          enabled: true,
        },
      });

      expect(result.score).toBe(1.0);
    });

    test("matches nested objects with fuzzy rules", async () => {
      const scorer = StructuredOutputScorer({ match: "fuzzy" });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          config: {
            host: "LOCALHOST",
            port: 8080.01,
          },
        }),
        expected: {
          config: {
            host: "localhost",
            port: 8080,
          },
        },
      });

      expect(result.score).toBe(1.0);
    });

    test("supports function validators in fuzzy mode", async () => {
      const scorer = StructuredOutputScorer({ match: "fuzzy" });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          age: 25,
          email: "user@example.com",
          role: "admin",
        }),
        expected: {
          age: (value: number) => value >= 18 && value <= 100,
          email: (value: string) => value.includes("@"),
          role: (value: string) => ["admin", "user", "guest"].includes(value),
        },
      });

      expect(result.score).toBe(1.0);
      expect(result.metadata?.rationale).toBe("All expected fields match");
    });

    test("handles failing function validators in fuzzy mode", async () => {
      const scorer = StructuredOutputScorer({ match: "fuzzy" });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          age: 150, // Outside valid range
          email: "invalid-email", // No @ symbol
        }),
        expected: {
          age: (value: number) => value >= 18 && value <= 100,
          email: (value: string) => value.includes("@"),
        },
      });

      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain("Missing required fields");
    });
  });

  describe("custom matching", () => {
    test("uses custom match function", async () => {
      const scorer = StructuredOutputScorer({
        match: (expected, actual, key) => {
          if (key === "timestamp") {
            // Allow any timestamp within last hour
            const now = Date.now();
            return actual >= now - 3600000 && actual <= now;
          }
          return expected === actual;
        },
      });

      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          action: "create",
          timestamp: Date.now() - 1000, // 1 second ago
        }),
        expected: {
          action: "create",
          timestamp: Date.now(),
        },
      });

      expect(result.score).toBe(1.0);
    });

    test("custom function with validation", async () => {
      const scorer = StructuredOutputScorer({
        match: (expected, actual, key) => {
          if (key === "age") {
            return actual >= 18 && actual <= 100;
          }
          return expected === actual;
        },
      });

      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          name: "John",
          age: 25,
        }),
        expected: {
          name: "John",
          age: 30, // Expected doesn't matter for age validation
        },
      });

      expect(result.score).toBe(1.0);
    });
  });

  describe("configuration options", () => {
    test("requireAll: false gives partial credit", async () => {
      const scorer = StructuredOutputScorer({ requireAll: false });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          name: "test",
          value: 99, // Wrong
        }),
        expected: {
          name: "test",
          value: 42,
          missing: "field",
        },
      });

      expect(result.score).toBe(1 / 3); // 1 out of 3 fields match
      expect(result.metadata?.rationale).toContain("Matched 1/3 fields");
    });

    test("allowExtras: false fails on extra fields", async () => {
      const scorer = StructuredOutputScorer({ allowExtras: false });
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          name: "test",
          value: 42,
          extra: "not allowed",
        }),
        expected: {
          name: "test",
          value: 42,
        },
      });

      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toBe("Unexpected extra fields: extra");
    });

    test("debug: true logs comparison details", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const scorer = StructuredOutputScorer({ debug: true });
      await scorer({
        input: "test",
        output: JSON.stringify({ foo: "bar" }),
        expected: { foo: "bar" },
      });

      expect(consoleSpy).toHaveBeenCalledWith("StructuredOutputScorer debug:");
      expect(consoleSpy).toHaveBeenCalledWith("Expected:", { foo: "bar" });
      expect(consoleSpy).toHaveBeenCalledWith("Actual:", { foo: "bar" });

      consoleSpy.mockRestore();
    });
  });

  describe("edge cases", () => {
    test("handles undefined and null values", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          a: null,
          c: "value",
          // Note: b: undefined is omitted by JSON.stringify
        }),
        expected: {
          a: null,
          b: undefined,
          c: "value",
        },
      });

      // Since JSON cannot represent undefined, when we expect undefined and the field is missing,
      // it's considered a match in strict mode (both are undefined)
      expect(result.score).toBe(1.0);
      expect(result.metadata?.rationale).toBe("All expected fields match");
    });

    test("handles empty objects", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({}),
        expected: {},
      });

      expect(result.score).toBe(1.0);
    });

    test("handles arrays with objects", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          items: [
            { id: 1, name: "A" },
            { id: 2, name: "B" },
          ],
        }),
        expected: {
          items: [
            { id: 1, name: "A" },
            { id: 2, name: "B" },
          ],
        },
      });

      expect(result.score).toBe(1.0);
    });

    test("provides detailed mismatch information", async () => {
      const scorer = StructuredOutputScorer();
      const result = await scorer({
        input: "test",
        output: JSON.stringify({
          name: "wrong",
          value: 0,
          flag: false,
        }),
        expected: {
          name: "correct",
          value: 42,
          flag: true,
        },
      });

      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain(
        'name: expected "correct", got "wrong"',
      );
      expect(result.metadata?.rationale).toContain("value: expected 42, got 0");
      expect(result.metadata?.rationale).toContain(
        "flag: expected true, got false",
      );
    });
  });

  describe("integration with toEval", () => {
    test("works with toEval matcher", async () => {
      const task = async () =>
        JSON.stringify({
          action: "search",
          query: "test query",
          filters: { status: "active" },
        });

      const expectedOutput = {
        action: "search",
        query: "test query",
        filters: { status: "active" },
      };

      await expect("Find active items").toEval(
        expectedOutput,
        task,
        StructuredOutputScorer(),
        1.0,
      );
    });

    test("works with partial credit", async () => {
      const task = async () =>
        JSON.stringify({
          action: "search",
          query: "different query",
        });

      const expectedOutput = {
        action: "search",
        query: "test query",
        filters: { status: "active" },
      };

      await expect("Find items").toEval(
        expectedOutput,
        task,
        StructuredOutputScorer({ requireAll: false }),
        0.3, // Only 1/3 fields match
      );
    });
  });
});
