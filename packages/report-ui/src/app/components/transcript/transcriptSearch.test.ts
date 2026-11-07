import { describe, expect, test } from "vitest";
import type { TranscriptEvent } from "../../model";
import { eventMatchesSearch } from "./transcriptSearch";

const message: TranscriptEvent = {
  kind: "message",
  id: "m1",
  role: "user",
  content: "Refund invoice INV_404",
};

const tool: TranscriptEvent = {
  kind: "tool",
  id: "t1",
  callId: "call_lookup",
  name: "lookupInvoice",
  arguments: { invoiceId: "inv_404" },
  result: { status: "flagged" },
};

describe("eventMatchesSearch", () => {
  test("matches message content case-insensitively", () => {
    expect(eventMatchesSearch(message, "inv_404")).toBe(true);
    expect(eventMatchesSearch(message, "chargeback")).toBe(false);
  });

  test("matches tool names, arguments, and results", () => {
    expect(eventMatchesSearch(tool, "lookupinvoice")).toBe(true);
    expect(eventMatchesSearch(tool, "flagged")).toBe(true);
    expect(eventMatchesSearch(tool, "refund")).toBe(false);
  });

  test("ignores tool call ids, which are not highlighted", () => {
    expect(eventMatchesSearch(tool, "call_")).toBe(false);
  });

  test("treats an empty query as a match", () => {
    expect(eventMatchesSearch(tool, "")).toBe(true);
  });
});
