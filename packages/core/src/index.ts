import { z } from "zod";

/** Primitive scalar values allowed in persisted vitest-evals JSON artifacts. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON-safe value shape used by reports, normalized sessions, and traces. */
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Well-known OpenTelemetry GenAI operation names. */
export type GenAiOperationName =
  | "chat"
  | "create_agent"
  | "embeddings"
  | "execute_tool"
  | "generate_content"
  | "invoke_agent"
  | "invoke_workflow"
  | "retrieval"
  | "text_completion"
  | (string & {});

/** Well-known OpenTelemetry GenAI output content types. */
export type GenAiOutputType =
  | "image"
  | "json"
  | "speech"
  | "text"
  | (string & {});

/** Well-known OpenTelemetry GenAI provider names. */
export type GenAiProviderName =
  | "anthropic"
  | "aws.bedrock"
  | "azure.ai.inference"
  | "azure.ai.openai"
  | "cohere"
  | "deepseek"
  | "gcp.gemini"
  | "gcp.gen_ai"
  | "gcp.vertex_ai"
  | "groq"
  | "ibm.watsonx.ai"
  | "mistral_ai"
  | "openai"
  | "perplexity"
  | "x_ai"
  | (string & {});

/** Well-known OpenTelemetry GenAI token types. */
export type GenAiTokenType = "input" | "output" | (string & {});

/** Well-known OpenTelemetry GenAI tool execution types. */
export type GenAiToolType =
  | "datastore"
  | "extension"
  | "function"
  | (string & {});

/** Typed subset of OpenTelemetry GenAI semantic attributes. */
export type GenAiSemanticAttributes = {
  "gen_ai.agent.description"?: string;
  "gen_ai.agent.id"?: string;
  "gen_ai.agent.name"?: string;
  "gen_ai.agent.version"?: string;
  "gen_ai.conversation.id"?: string;
  "gen_ai.data_source.id"?: string;
  "gen_ai.embeddings.dimension.count"?: number;
  "gen_ai.evaluation.explanation"?: string;
  "gen_ai.evaluation.name"?: string;
  "gen_ai.evaluation.score.label"?: string;
  "gen_ai.evaluation.score.value"?: number;
  "gen_ai.input.messages"?: JsonValue;
  "gen_ai.operation.name"?: GenAiOperationName;
  "gen_ai.output.messages"?: JsonValue;
  "gen_ai.output.type"?: GenAiOutputType;
  "gen_ai.prompt.name"?: string;
  "gen_ai.provider.name"?: GenAiProviderName;
  "gen_ai.request.choice.count"?: number;
  "gen_ai.request.encoding_formats"?: string[];
  "gen_ai.request.frequency_penalty"?: number;
  "gen_ai.request.max_tokens"?: number;
  "gen_ai.request.model"?: string;
  "gen_ai.request.presence_penalty"?: number;
  "gen_ai.request.seed"?: number;
  "gen_ai.request.stop_sequences"?: string[];
  "gen_ai.request.stream"?: boolean;
  "gen_ai.request.temperature"?: number;
  "gen_ai.request.top_k"?: number;
  "gen_ai.request.top_p"?: number;
  "gen_ai.response.finish_reasons"?: string[];
  "gen_ai.response.id"?: string;
  "gen_ai.response.model"?: string;
  "gen_ai.response.time_to_first_chunk"?: number;
  "gen_ai.retrieval.documents"?: JsonValue;
  "gen_ai.retrieval.query.text"?: string;
  "gen_ai.system_instructions"?: JsonValue;
  "gen_ai.token.type"?: GenAiTokenType;
  "gen_ai.tool.call.arguments"?: JsonValue;
  "gen_ai.tool.call.id"?: string;
  "gen_ai.tool.call.result"?: JsonValue;
  "gen_ai.tool.definitions"?: JsonValue;
  "gen_ai.tool.description"?: string;
  "gen_ai.tool.name"?: string;
  "gen_ai.tool.type"?: GenAiToolType;
  "gen_ai.usage.cache_creation.input_tokens"?: number;
  "gen_ai.usage.cache_read.input_tokens"?: number;
  "gen_ai.usage.input_tokens"?: number;
  "gen_ai.usage.output_tokens"?: number;
  "gen_ai.usage.reasoning.output_tokens"?: number;
  "gen_ai.workflow.name"?: string;
};

/** Attribute keys defined by the OpenTelemetry GenAI semantic conventions. */
export type GenAiSemanticAttributeKey = keyof GenAiSemanticAttributes;

/** Typed OpenTelemetry semantic attributes accepted on normalized spans. */
export type OpenTelemetrySemanticAttributes = GenAiSemanticAttributes & {
  "error.type"?: string;
  "server.address"?: string;
  "server.port"?: number;
};

/** Known OpenTelemetry semantic attribute keys accepted on normalized spans. */
export type OpenTelemetrySemanticAttributeKey =
  keyof OpenTelemetrySemanticAttributes;

/** Attribute keys accepted on normalized spans. */
export type NormalizedSpanAttributeKey =
  | OpenTelemetrySemanticAttributeKey
  | (string & {});

/**
 * JSON-safe span attributes. Known OpenTelemetry GenAI keys are typed while
 * custom provider and application keys remain allowed.
 */
export type NormalizedSpanAttributes = OpenTelemetrySemanticAttributes & {
  [key: string]: JsonValue | undefined;
};

/** Normalized error attached to tool calls and spans. */
export type NormalizedError = {
  /** Human-readable failure message. */
  message: string;
  /** Optional provider or runtime error type. */
  type?: string;
  /** Extra JSON-safe error metadata. */
  [key: string]: JsonValue | undefined;
};

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

/** Current schema version for collected report workspaces. */
export const REPORT_WORKSPACE_SCHEMA_VERSION = 1;

const FiniteNumberSchema = z.number().finite();
const OptionalFiniteNumberSchema = z.preprocess(
  (value) =>
    typeof value === "number" && !Number.isFinite(value) ? undefined : value,
  FiniteNumberSchema.optional(),
);
const NullableFiniteNumberSchema = z.preprocess(
  (value) =>
    typeof value === "number" && !Number.isFinite(value) ? null : value,
  FiniteNumberSchema.nullable().optional(),
);

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

/** Usage values normalized by vitest-evals harnesses. */
export const UsageSummarySchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    inputTokens: FiniteNumberSchema.optional(),
    outputTokens: FiniteNumberSchema.optional(),
    reasoningTokens: FiniteNumberSchema.optional(),
    totalTokens: FiniteNumberSchema.optional(),
    toolCalls: FiniteNumberSchema.optional(),
    retries: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .catchall(JsonValueSchema);

/** Usage values normalized by vitest-evals harnesses. */
export type UsageSummary = {
  /** Provider that served the application run. */
  provider?: string;
  /** Model used for the application run. */
  model?: string;
  /** Input, prompt, or request tokens consumed by the run. */
  inputTokens?: number;
  /** Output or completion tokens produced by the run. */
  outputTokens?: number;
  /** Reasoning tokens reported by providers that expose them. */
  reasoningTokens?: number;
  /** Total token count reported by the provider or adapter. */
  totalTokens?: number;
  /** Count of tool calls observed during the run. */
  toolCalls?: number;
  /** Retry count observed during the run. */
  retries?: number;
  /** Provider-specific JSON-safe usage details. Cost estimates belong here. */
  metadata?: Record<string, JsonValue>;
};

/** Timing values normalized by vitest-evals harnesses. */
export const TimingSummarySchema = z
  .object({
    totalMs: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .catchall(JsonValueSchema);

/** Timing values normalized by vitest-evals harnesses. */
export type TimingSummary = {
  /** End-to-end run duration in milliseconds. */
  totalMs?: number;
  /** Extra JSON-safe timing metadata. */
  metadata?: Record<string, JsonValue>;
};

/** Normalized error object captured in a tool call or trace span. */
export const NormalizedErrorSchema = z
  .object({
    message: z.string(),
    type: z.string().optional(),
  })
  .catchall(JsonValueSchema);

/** Normalized tool call captured in a harness session. */
export const ToolCallRecordSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    arguments: JsonObjectSchema.optional(),
    result: JsonValueSchema.optional(),
    error: NormalizedErrorSchema.optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    durationMs: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .catchall(JsonValueSchema);

/** Normalized tool call captured in a harness session. */
export type ToolCallRecord = {
  /** Provider or runtime tool-call id when one is available. */
  id?: string;
  /** Tool name as exposed to the agent or application runtime. */
  name: string;
  /** JSON-safe tool arguments after provider/runtime normalization. */
  arguments?: Record<string, JsonValue>;
  /** JSON-safe tool result returned by the application tool. */
  result?: JsonValue;
  /** Normalized tool error when execution failed. */
  error?: NormalizedError;
  /** ISO timestamp for the start of tool execution. */
  startedAt?: string;
  /** ISO timestamp for the end of tool execution. */
  finishedAt?: string;
  /** Tool execution duration in milliseconds. */
  durationMs?: number;
  /** Extra JSON-safe tool metadata for reporters and custom judges. */
  metadata?: Record<string, JsonValue>;
};

/** Normalized transcript message captured in a harness session. */
export const NormalizedMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: JsonValueSchema.optional(),
    toolCalls: z.array(ToolCallRecordSchema).optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .catchall(JsonValueSchema);

/** Normalized transcript message captured in a harness session. */
export type NormalizedMessage = {
  /** Transcript role for the normalized message. */
  role: "system" | "user" | "assistant" | "tool";
  /** JSON-safe message content. */
  content?: JsonValue;
  /** Tool calls associated with this message. */
  toolCalls?: ToolCallRecord[];
  /** Extra JSON-safe message metadata. */
  metadata?: Record<string, JsonValue>;
};

/** Normalized transcript produced by an application harness. */
export const NormalizedSessionSchema = z
  .object({
    messages: z.array(NormalizedMessageSchema).default([]),
    provider: z.string().optional(),
    model: z.string().optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .catchall(JsonValueSchema);

/** Normalized transcript produced by an application harness. */
export type NormalizedSession = {
  /** Ordered normalized transcript messages. */
  messages: NormalizedMessage[];
  /** Provider that produced the session when known. */
  provider?: string;
  /** Model that produced the session when known. */
  model?: string;
  /** Extra JSON-safe session metadata. */
  metadata?: Record<string, JsonValue>;
};

/** Attribute schema attached to normalized traces, spans, and events. */
export const NormalizedSpanAttributesSchema = JsonObjectSchema;

/** Event attached to a normalized span. */
export const NormalizedSpanEventSchema = z
  .object({
    name: z.string(),
    timestamp: z.string().optional(),
    attributes: NormalizedSpanAttributesSchema.optional(),
  })
  .catchall(JsonValueSchema);

/** Event attached to a normalized span. */
export type NormalizedSpanEvent = {
  /** Event name emitted by the runtime or harness. */
  name: string;
  /** ISO timestamp for the event when available. */
  timestamp?: string;
  /** JSON-safe event attributes. */
  attributes?: NormalizedSpanAttributes;
};

/** Normalized operation span captured during a harness run. */
export const NormalizedSpanSchema = z
  .object({
    id: z.string().optional(),
    traceId: z.string().optional(),
    parentId: z.string().optional(),
    name: z.string(),
    kind: z
      .enum(["run", "agent", "model", "tool", "guardrail", "handoff", "custom"])
      .optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    durationMs: FiniteNumberSchema.optional(),
    status: z.enum(["ok", "error"]).optional(),
    error: NormalizedErrorSchema.optional(),
    attributes: NormalizedSpanAttributesSchema.optional(),
    events: z.array(NormalizedSpanEventSchema).optional(),
  })
  .catchall(JsonValueSchema);

/** Normalized operation span captured during a harness run. */
export type NormalizedSpan = {
  /** Runtime or provider span id when one is available. */
  id?: string;
  /** Trace id this span belongs to. */
  traceId?: string;
  /** Parent span id when the runtime exposes hierarchy. */
  parentId?: string;
  /** Human-readable operation name. */
  name: string;
  /** Coarse operation kind used by reporters and judges. */
  kind?:
    | "run"
    | "agent"
    | "model"
    | "tool"
    | "guardrail"
    | "handoff"
    | "custom";
  /** ISO timestamp for the start of the span. */
  startedAt?: string;
  /** ISO timestamp for the end of the span. */
  finishedAt?: string;
  /** Span duration in milliseconds. */
  durationMs?: number;
  /** Success or failure status for the span. */
  status?: "ok" | "error";
  /** Normalized error when the span failed. */
  error?: NormalizedError;
  /** JSON-safe operation attributes. */
  attributes?: NormalizedSpanAttributes;
  /** Events observed inside this span. */
  events?: NormalizedSpanEvent[];
};

/** Normalized trace captured during a harness run. */
export const NormalizedTraceSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    durationMs: FiniteNumberSchema.optional(),
    metadata: JsonObjectSchema.optional(),
    spans: z.array(NormalizedSpanSchema).default([]),
  })
  .catchall(JsonValueSchema);

/** Normalized trace captured during a harness run. */
export type NormalizedTrace = {
  /** Runtime or provider trace id when one is available. */
  id?: string;
  /** Human-readable trace or workflow name. */
  name?: string;
  /** ISO timestamp for the start of the trace. */
  startedAt?: string;
  /** ISO timestamp for the end of the trace. */
  finishedAt?: string;
  /** Trace duration in milliseconds. */
  durationMs?: number;
  /** Extra JSON-safe trace metadata. */
  metadata?: Record<string, JsonValue>;
  /** Spans that make up this trace. */
  spans: NormalizedSpan[];
};

/** Full normalized harness run as stored in Vitest assertion metadata. */
export const HarnessRunSchema = z
  .object({
    output: JsonValueSchema.optional(),
    session: NormalizedSessionSchema,
    usage: UsageSummarySchema,
    timings: TimingSummarySchema.optional(),
    artifacts: JsonObjectSchema.optional(),
    traces: z.array(NormalizedTraceSchema).optional(),
    errors: z.array(JsonObjectSchema),
  })
  .catchall(JsonValueSchema);

/** Full normalized harness run as stored in Vitest assertion metadata. */
type OutputField<TOutput extends JsonValue | undefined> =
  undefined extends TOutput ? { output?: TOutput } : { output: TOutput };

/**
 * Normalized result returned by every harness execution.
 *
 * @example
 * ```ts
 * const run: HarnessRun<{ status: "approved" }> = {
 *   output: { status: "approved" },
 *   session: {
 *     messages: [
 *       { role: "user", content: "Refund invoice inv_123" },
 *       { role: "assistant", content: { status: "approved" } },
 *     ],
 *   },
 *   usage: { totalTokens: 260 },
 *   errors: [],
 * };
 * ```
 */
export type HarnessRun<
  TOutput extends JsonValue | undefined = JsonValue | undefined,
> = OutputField<TOutput> & {
  /** Normalized transcript and provider/session metadata. */
  session: NormalizedSession;
  /** Stable provider usage units such as tokens, tools, and retries. */
  usage: UsageSummary;
  /** Optional timing summary for the run. */
  timings?: TimingSummary;
  /** JSON-safe run artifacts captured by the harness or test context. */
  artifacts?: Record<string, JsonValue>;
  /** Normalized traces and spans captured during execution. */
  traces?: NormalizedTrace[];
  /** Normalized errors captured during execution. */
  errors: Array<Record<string, JsonValue>>;
};

/** Error value with an attached partial or complete normalized harness run. */
export type HarnessRunError = Error & {
  /** Attached normalized harness run recovered from a thrown error. */
  vitestEvalsRun: HarnessRun;
};

/** Harness metadata stored by vitest-evals on Vitest task metadata. */
export const HarnessMetaSchema = z
  .object({
    name: z.string().optional(),
    run: HarnessRunSchema.optional(),
  })
  .catchall(JsonValueSchema);

/** Harness metadata stored by vitest-evals on Vitest task metadata. */
export type HarnessMeta = z.infer<typeof HarnessMetaSchema>;

/** Score record stored by vitest-evals on Vitest task metadata. */
export const EvalScoreSchema = z
  .object({
    name: z.string().optional(),
    score: NullableFiniteNumberSchema,
    metadata: JsonObjectSchema.optional(),
  })
  .catchall(JsonValueSchema);

/** Score record stored by vitest-evals on Vitest task metadata. */
export type EvalScore = z.infer<typeof EvalScoreSchema>;

/** Eval metadata stored by vitest-evals on Vitest task metadata. */
export const EvalMetaSchema = z
  .object({
    scores: z.array(EvalScoreSchema).optional(),
    avgScore: OptionalFiniteNumberSchema,
    output: JsonValueSchema.optional(),
    thresholdFailed: z.boolean().optional(),
  })
  .catchall(JsonValueSchema);

/** Eval metadata stored by vitest-evals on Vitest task metadata. */
export type EvalMeta = z.infer<typeof EvalMetaSchema>;

/** Combined eval and harness metadata stored on a Vitest assertion. */
export const EvalTaskMetaSchema = z
  .object({
    eval: EvalMetaSchema.optional(),
    harness: HarnessMetaSchema.optional(),
  })
  .catchall(JsonValueSchema);

/** Combined eval and harness metadata stored on a Vitest assertion. */
export type EvalTaskMeta = z.infer<typeof EvalTaskMetaSchema>;

/** Assertion record read from Vitest's JSON reporter output. */
export const VitestJsonAssertionSchema = z
  .object({
    ancestorTitles: z.array(z.string()).default([]),
    fullName: z.string(),
    status: VitestJsonStatusSchema,
    title: z.string(),
    meta: JsonValueSchema.optional(),
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
    startTime: FiniteNumberSchema,
    endTime: FiniteNumberSchema,
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

/** One collected Vitest JSON report source in a multi-run workspace. */
export const ReportRunSchema = z
  .object({
    id: z.string(),
    source: z.string().optional(),
    status: z.enum(["passed", "failed"]),
    startedAt: FiniteNumberSchema.optional(),
    durationMs: FiniteNumberSchema.optional(),
    totals: z.object({
      total: FiniteNumberSchema,
      passed: FiniteNumberSchema,
      failed: FiniteNumberSchema,
      skipped: FiniteNumberSchema,
      evalTotal: FiniteNumberSchema,
      evalPassed: FiniteNumberSchema,
      evalFailed: FiniteNumberSchema,
    }),
  })
  .passthrough();

/** One collected Vitest JSON report source in a multi-run workspace. */
export type ReportRun = z.infer<typeof ReportRunSchema>;

/** One eval or harness-backed test case collected from Vitest JSON. */
export const ReportCaseSchema = z
  .object({
    id: z.string(),
    runId: z.string(),
    source: z.string().optional(),
    file: z.string(),
    displayFile: z.string(),
    title: z.string(),
    fullName: z.string(),
    ancestorTitles: z.array(z.string()),
    tags: z.array(z.string()).optional(),
    displayName: z.string(),
    status: VitestJsonStatusSchema,
    durationMs: FiniteNumberSchema.optional(),
    location: VitestJsonLocationSchema.optional(),
    failureMessages: z.array(z.string()).default([]),
    eval: EvalMetaSchema.optional(),
    harness: HarnessMetaSchema.optional(),
  })
  .passthrough();

/** One eval or harness-backed test case collected from Vitest JSON. */
export type ReportCase = z.infer<typeof ReportCaseSchema>;

/** Full multi-run report workspace consumed by rich report UIs. */
export const ReportWorkspaceSchema = z
  .object({
    schemaVersion: z.literal(REPORT_WORKSPACE_SCHEMA_VERSION),
    runs: z.array(ReportRunSchema),
    cases: z.array(ReportCaseSchema),
  })
  .passthrough();

/** Full multi-run report workspace consumed by rich report UIs. */
export type ReportWorkspace = z.infer<typeof ReportWorkspaceSchema>;

/** Input accepted when collecting one Vitest JSON report into a workspace. */
export type ReportWorkspaceInput =
  | VitestJsonReport
  | {
      report: VitestJsonReport;
      source?: string;
    };

/** Options for collecting one or more Vitest JSON reports. */
export type CollectReportWorkspaceOptions = {
  /** Workspace prefix used to render source files as relative paths. */
  workspace?: string;
};

/** Parses and validates an unknown value as a Vitest JSON report artifact. */
export function parseVitestJsonReport(input: unknown): VitestJsonReport {
  return parseWithSchema(VitestJsonReportSchema, input, "Vitest JSON report");
}

/** Parses and validates an unknown value as a collected report workspace. */
export function parseReportWorkspace(input: unknown): ReportWorkspace {
  return parseWithSchema(ReportWorkspaceSchema, input, "report workspace");
}

/** Reads eval metadata from an arbitrary Vitest assertion meta value. */
export function readEvalTaskMeta(input: unknown): EvalTaskMeta | undefined {
  if (!isJsonObject(input)) {
    return undefined;
  }

  const evalResult = EvalMetaSchema.safeParse(input.eval);
  const harnessResult = HarnessMetaSchema.safeParse(input.harness);
  const meta: EvalTaskMeta = {
    ...(evalResult.success && input.eval !== undefined
      ? { eval: evalResult.data }
      : {}),
    ...(harnessResult.success && input.harness !== undefined
      ? { harness: harnessResult.data }
      : {}),
  };

  return meta.eval || meta.harness ? meta : undefined;
}

/** Collects eval and harness metadata from one or more Vitest JSON reports. */
export function collectReportWorkspace(
  input: ReportWorkspaceInput | ReportWorkspaceInput[],
  options: CollectReportWorkspaceOptions = {},
): ReportWorkspace {
  const entries = Array.isArray(input) ? input : [input];
  const runs: ReportRun[] = [];
  const cases: ReportCase[] = [];

  entries.forEach((entry, index) => {
    const { report, source } = normalizeWorkspaceInput(entry);
    const runId = source ?? `run-${index + 1}`;
    const runCases: ReportCase[] = [];

    for (const file of report.testResults) {
      for (const assertion of file.assertionResults) {
        const meta = readEvalTaskMeta(assertion.meta);
        if (!meta) {
          continue;
        }

        runCases.push({
          id: createCaseId(runId, file.name, assertion),
          runId,
          ...(source ? { source } : {}),
          file: file.name,
          displayFile: normalizeReportPath(file.name, options.workspace),
          title: assertion.title,
          fullName: assertion.fullName,
          ancestorTitles: assertion.ancestorTitles,
          ...(assertion.tags ? { tags: assertion.tags } : {}),
          displayName: formatDisplayName(assertion),
          status: assertion.status,
          ...(typeof assertion.duration === "number"
            ? { durationMs: assertion.duration }
            : {}),
          ...(assertion.location ? { location: assertion.location } : {}),
          failureMessages: assertion.failureMessages ?? [],
          ...(meta.eval ? { eval: meta.eval } : {}),
          ...(meta.harness ? { harness: meta.harness } : {}),
        });
      }
    }

    runs.push({
      id: runId,
      ...(source ? { source } : {}),
      status:
        report.success &&
        runCases.every((testCase) => testCase.status !== "failed")
          ? "passed"
          : "failed",
      startedAt: report.startTime,
      durationMs: resolveRunDuration(report),
      totals: {
        total: report.numTotalTests,
        passed: report.numPassedTests,
        failed: report.numFailedTests,
        skipped: report.numPendingTests + report.numTodoTests,
        evalTotal: runCases.length,
        evalPassed: runCases.filter((testCase) => testCase.status === "passed")
          .length,
        evalFailed: runCases.filter((testCase) => testCase.status === "failed")
          .length,
      },
    });
    cases.push(...runCases);
  });

  return {
    schemaVersion: REPORT_WORKSPACE_SCHEMA_VERSION,
    runs,
    cases,
  };
}

/**
 * Flattens every recorded tool call from a normalized session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const names = toolCalls(result.session).map((call) => call.name);
 *
 * expect(names).toEqual(["lookupInvoice", "createRefund"]);
 * ```
 */
export function toolCalls(session: NormalizedSession): ToolCallRecord[] {
  return session.messages.flatMap((message) => message.toolCalls ?? []);
}

/**
 * Flattens every recorded span from a normalized harness run.
 *
 * @param run - Normalized harness run produced by a harness.
 *
 * @example
 * ```ts
 * const modelSpans = spans(result).filter((span) => span.kind === "model");
 * ```
 */
export function spans(run: HarnessRun): NormalizedSpan[] {
  return (run.traces ?? []).flatMap((trace) => trace.spans);
}

/**
 * Alias for `spans(...)` for consumers that prefer trace-oriented naming.
 *
 * @param run - Normalized harness run produced by a harness.
 */
export function traceSpans(run: HarnessRun): NormalizedSpan[] {
  return spans(run);
}

/**
 * Returns spans of one coarse operation kind from a normalized run.
 *
 * @param run - Normalized harness run produced by a harness.
 * @param kind - Span kind to keep.
 */
export function spansByKind(
  run: HarnessRun,
  kind: NonNullable<NormalizedSpan["kind"]>,
): NormalizedSpan[] {
  return spans(run).filter((span) => span.kind === kind);
}

/**
 * Returns every span that explicitly failed or carries a normalized error.
 *
 * @param run - Normalized harness run produced by a harness.
 */
export function failedSpans(run: HarnessRun): NormalizedSpan[] {
  return spans(run).filter(
    (span) => span.status === "error" || span.error !== undefined,
  );
}

/**
 * Filters normalized session messages by role.
 *
 * @param session - Normalized session produced by a harness run.
 * @param role - Message role to keep.
 *
 * @example
 * ```ts
 * const assistantText = messagesByRole(result.session, "assistant")
 *   .map((message) => message.content)
 *   .join("\n");
 * ```
 */
export function messagesByRole(
  session: NormalizedSession,
  role: NormalizedMessage["role"],
): NormalizedMessage[] {
  return session.messages.filter((message) => message.role === role);
}

/**
 * Returns every normalized system message from a session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const systemPrompts = systemMessages(result.session);
 * ```
 */
export function systemMessages(session: NormalizedSession) {
  return messagesByRole(session, "system");
}

/**
 * Returns every normalized user message from a session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const firstPrompt = userMessages(result.session)[0]?.content;
 * ```
 */
export function userMessages(session: NormalizedSession) {
  return messagesByRole(session, "user");
}

/**
 * Returns every normalized assistant message from a session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const finalAnswer = assistantMessages(result.session).at(-1)?.content;
 * ```
 */
export function assistantMessages(
  session: NormalizedSession,
): NormalizedMessage[] {
  return messagesByRole(session, "assistant");
}

function hasNonEmptyMessageContent(message: NormalizedMessage) {
  return (
    message.content !== undefined &&
    (typeof message.content !== "string" || message.content.trim().length > 0)
  );
}

/**
 * Returns the latest assistant message content, ignoring empty text messages.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const finalAnswer = latestAssistantMessageContent(result.session);
 * ```
 */
export function latestAssistantMessageContent(session: NormalizedSession) {
  return [...assistantMessages(session)]
    .reverse()
    .find(hasNonEmptyMessageContent)?.content;
}

/**
 * Returns every normalized tool message from a session.
 *
 * @param session - Normalized session produced by a harness run.
 *
 * @example
 * ```ts
 * const toolOutputs = toolMessages(result.session).map((message) => message.content);
 * ```
 */
export function toolMessages(session: NormalizedSession) {
  return messagesByRole(session, "tool");
}

function parseWithSchema<T>(
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

function normalizeWorkspaceInput(input: ReportWorkspaceInput) {
  if (isRecord(input) && "report" in input) {
    return {
      report: input.report as VitestJsonReport,
      source: typeof input.source === "string" ? input.source : undefined,
    };
  }

  return {
    report: parseVitestJsonReport(input),
  };
}

function createCaseId(
  runId: string,
  file: string,
  assertion: VitestJsonAssertion,
) {
  return [runId, file, assertion.location?.line ?? 0, assertion.fullName].join(
    ":",
  );
}

function formatDisplayName(assertion: VitestJsonAssertion) {
  return [...assertion.ancestorTitles, assertion.title]
    .filter((part) => part.length > 0)
    .join(" > ");
}

function resolveRunDuration(report: VitestJsonReport) {
  const intervals = report.testResults
    .map((file) => {
      if (
        !Number.isFinite(file.startTime) ||
        !Number.isFinite(file.endTime) ||
        file.endTime < file.startTime
      ) {
        return undefined;
      }

      return {
        start: file.startTime,
        end: file.endTime,
      };
    })
    .filter((interval): interval is { start: number; end: number } =>
      Boolean(interval),
    );

  if (intervals.length === 0) {
    return undefined;
  }

  return (
    Math.max(...intervals.map((interval) => interval.end)) -
    Math.min(...intervals.map((interval) => interval.start))
  );
}

function normalizeReportPath(path: string, workspace?: string) {
  const normalized = path.replace(/\\/g, "/");
  if (!workspace) {
    return normalized;
  }

  const workspacePath = workspace.replace(/\\/g, "/").replace(/\/+$/, "");
  if (
    normalized !== workspacePath &&
    !normalized.startsWith(`${workspacePath}/`)
  ) {
    return normalized;
  }

  return normalized.slice(workspacePath.length).replace(/^\/+/, "");
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return isRecord(value) && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
