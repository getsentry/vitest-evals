import { z } from "zod";
import {
  FiniteNumberSchema,
  OptionalFiniteNumberSchema,
  parseWithSchema,
} from "../schema-utils";

/** Status values emitted by Vitest JSON reports. */
export const VitestJsonStatusSchema = z.enum([
  "passed",
  "failed",
  "skipped",
  "pending",
  "todo",
  "disabled",
]);

/** Status values emitted by Vitest JSON reports. */
export type VitestJsonStatus = z.infer<typeof VitestJsonStatusSchema>;

/** Source location attached to one Vitest assertion. */
export const VitestJsonLocationSchema = z
  .object({
    line: FiniteNumberSchema,
    column: FiniteNumberSchema,
  })
  .passthrough();

/** Source location attached to one Vitest assertion. */
export type VitestJsonLocation = z.infer<typeof VitestJsonLocationSchema>;

/** Assertion record read from Vitest's JSON reporter output. */
export const VitestJsonAssertionSchema = z
  .object({
    ancestorTitles: z.array(z.string()).default([]),
    fullName: z.string(),
    status: VitestJsonStatusSchema,
    title: z.string(),
    meta: z.unknown().optional(),
    duration: FiniteNumberSchema.nullable().optional(),
    failureMessages: z.array(z.string()).nullable().optional(),
    location: VitestJsonLocationSchema.nullable().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

/** Assertion record read from Vitest's JSON reporter output. */
export type VitestJsonAssertion = z.infer<typeof VitestJsonAssertionSchema>;

/** Test-file record read from Vitest's JSON reporter output. */
export const VitestJsonFileSchema = z
  .object({
    message: z.string(),
    name: z.string(),
    status: z.enum(["failed", "passed"]),
    startTime: OptionalFiniteNumberSchema,
    endTime: OptionalFiniteNumberSchema,
    assertionResults: z.array(VitestJsonAssertionSchema).default([]),
  })
  .passthrough();

/** Test-file record read from Vitest's JSON reporter output. */
export type VitestJsonFile = z.infer<typeof VitestJsonFileSchema>;

/** Top-level Vitest JSON reporter payload. */
export const VitestJsonReportSchema = z
  .object({
    numFailedTests: FiniteNumberSchema,
    numPassedTests: FiniteNumberSchema,
    numPendingTests: FiniteNumberSchema,
    numTodoTests: FiniteNumberSchema,
    numTotalTests: FiniteNumberSchema,
    startTime: FiniteNumberSchema,
    success: z.boolean(),
    testResults: z.array(VitestJsonFileSchema).default([]),
  })
  .passthrough();

/** Top-level Vitest JSON reporter payload. */
export type VitestJsonReport = z.infer<typeof VitestJsonReportSchema>;

/** Parses and validates an unknown value as a Vitest JSON report artifact. */
export function parseVitestJsonReport(input: unknown): VitestJsonReport {
  return parseWithSchema(VitestJsonReportSchema, input, "Vitest JSON report");
}
