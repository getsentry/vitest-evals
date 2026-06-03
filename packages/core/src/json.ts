import { z } from "zod";

/** Primitive scalar values allowed in persisted vitest-evals JSON artifacts. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON-safe value shape used by reports, normalized sessions, and traces. */
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Schema for primitive scalar values in persisted report artifacts. */
export const JsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

/** Schema for any JSON-safe value in persisted report artifacts. */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonPrimitiveSchema,
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

/** Schema for JSON-safe object records in persisted report artifacts. */
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
