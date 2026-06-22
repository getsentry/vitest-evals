import { z } from "zod";
import { JsonValueSchema } from "../json";

/** Normalized error object captured in a tool result or trace span. */
export const NormalizedErrorSchema = z
  .object({
    message: z.string(),
    type: z.string().optional(),
  })
  .catchall(JsonValueSchema);

/** Normalized error attached to tool calls and spans. */
export type NormalizedError = z.infer<typeof NormalizedErrorSchema>;
