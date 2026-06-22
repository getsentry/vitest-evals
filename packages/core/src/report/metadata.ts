import { z } from "zod";
import { HarnessRunSchema, ToolCallSchema } from "../harness";
import { JsonObjectSchema, JsonValueSchema } from "../json";
import { isJsonObject, NullableFiniteNumberSchema } from "../schema-utils";

/** Harness metadata stored by vitest-evals on Vitest task metadata. */
export const HarnessMetaSchema = z
  .object({
    name: z.string().optional(),
    run: HarnessRunSchema.optional(),
  })
  .strict();

/** Harness metadata stored by vitest-evals on Vitest task metadata. */
export type HarnessMeta = z.infer<typeof HarnessMetaSchema>;

/** Score record stored by vitest-evals on Vitest task metadata. */
export const EvalScoreSchema = z
  .object({
    name: z.string().optional(),
    score: NullableFiniteNumberSchema,
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/** Score record stored by vitest-evals on Vitest task metadata. */
export type EvalScore = z.infer<typeof EvalScoreSchema>;

/** Eval metadata stored by vitest-evals on Vitest task metadata. */
export const EvalMetaSchema = z
  .object({
    scores: z.array(EvalScoreSchema).optional(),
    avgScore: NullableFiniteNumberSchema,
    output: JsonValueSchema.optional(),
    thresholdFailed: z.boolean().optional(),
    toolCalls: z.array(ToolCallSchema).optional(),
  })
  .strict();

/** Eval metadata stored by vitest-evals on Vitest task metadata. */
export type EvalMeta = z.infer<typeof EvalMetaSchema>;

/** Combined eval and harness metadata stored on a Vitest assertion. */
export const EvalTaskMetaSchema = z
  .object({
    eval: EvalMetaSchema.optional(),
    harness: HarnessMetaSchema.optional(),
  })
  .strict();

/** Combined eval and harness metadata stored on a Vitest assertion. */
export type EvalTaskMeta = z.infer<typeof EvalTaskMetaSchema>;

/** Reads eval metadata from an arbitrary Vitest assertion meta value. */
export function readEvalTaskMeta(input: unknown): EvalTaskMeta | undefined {
  if (!isJsonObject(input)) {
    return undefined;
  }

  const meta = {
    ...(input.eval !== undefined ? { eval: input.eval } : {}),
    ...(input.harness !== undefined ? { harness: input.harness } : {}),
  };
  if (!("eval" in meta) && !("harness" in meta)) {
    return undefined;
  }

  const result = EvalTaskMetaSchema.safeParse(meta);
  return result.success ? result.data : undefined;
}
