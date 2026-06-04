import type { JsonValue } from "./json";

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
