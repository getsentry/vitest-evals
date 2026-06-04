import { z } from "zod";
import type { JsonValue } from "./json";

export const FiniteNumberSchema = z.number().finite();

export const OptionalFiniteNumberSchema = z.preprocess(
  (value) =>
    value === null || (typeof value === "number" && !Number.isFinite(value))
      ? undefined
      : value,
  FiniteNumberSchema.optional(),
);

export const NullableFiniteNumberSchema = z.preprocess(
  (value) =>
    typeof value === "number" && !Number.isFinite(value) ? null : value,
  FiniteNumberSchema.nullable().optional(),
);

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  label: string,
) {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const reason = parsed.error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  throw new Error(`Invalid ${label}: ${reason}`);
}

export function isJsonObject(
  value: unknown,
): value is Record<string, JsonValue> {
  return isRecord(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
