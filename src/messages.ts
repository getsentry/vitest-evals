import { wrapText } from "./wrapText";

export type ToolCall = {
  name: string;
  arguments?: any;
  [key: string]: any;
};

type EvalBasePart = {
  [key: string]: any;
};

export type EvalTextPart = EvalBasePart & {
  type: "text";
  text: string;
};

export type EvalImagePart = EvalBasePart & {
  type: "image";
  image: unknown;
  mediaType?: string;
};

export type EvalFilePart = EvalBasePart & {
  type: "file";
  data: unknown;
  mediaType: string;
  filename?: string;
};

export type EvalReasoningPart = EvalBasePart & {
  type: "reasoning";
  text: string;
};

export type EvalToolCallPart = EvalBasePart & {
  type: "tool-call";
  toolName: string;
  input?: unknown;
  toolCallId?: string;
};

export type EvalToolResultPart = EvalBasePart & {
  type: "tool-result";
  toolName: string;
  output: unknown;
  toolCallId?: string;
};

export type EvalToolErrorPart = EvalBasePart & {
  type: "tool-error";
  toolName: string;
  error?: unknown;
  output?: unknown;
  toolCallId?: string;
};

export type EvalSourcePart = EvalBasePart & {
  type: "source";
  source?: unknown;
};

export type EvalPart =
  | EvalTextPart
  | EvalImagePart
  | EvalFilePart
  | EvalReasoningPart
  | EvalToolCallPart
  | EvalToolResultPart
  | EvalToolErrorPart
  | EvalSourcePart;

export type EvalMessage = {
  role: "system" | "user" | "assistant" | "tool";
  parts: EvalPart[];
  metadata?: Record<string, unknown>;
  [key: string]: any;
};

export type TaskInput = string | EvalMessage[];

export type TaskResult =
  | {
      result: string;
      messages?: never;
      toolCalls?: ToolCall[];
    }
  | {
      messages: EvalMessage[];
      result?: never;
      toolCalls?: ToolCall[];
    };

export type TaskOutput = string | TaskResult;

export type EvalDataInput =
  | {
      input: string;
      messages?: never;
    }
  | {
      messages: EvalMessage[];
      input?: never;
    };

export interface NormalizedInput {
  input: string;
  inputMessages: EvalMessage[];
}

export interface NormalizedOutput {
  output: string;
  outputMessages: EvalMessage[];
  toolCalls?: ToolCall[];
}

export interface NormalizedScorerPayload
  extends NormalizedInput,
    NormalizedOutput {
  messages: EvalMessage[];
}

const EMPTY_TEXT = "";

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEvalMessageArray(value: unknown): value is EvalMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.role === "string" &&
        Array.isArray(item.parts),
    )
  );
}

function textMessage(role: EvalMessage["role"], text: string): EvalMessage {
  return {
    role,
    parts: [{ type: "text", text }],
  };
}

function assertValidMessages(
  messages: unknown,
  fieldName: string,
): asserts messages is EvalMessage[] {
  if (!isEvalMessageArray(messages)) {
    throw new Error(`${fieldName} must be an array of message objects.`);
  }
}

function assertString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }
}

export function getTaskInput(
  input: string | undefined,
  messages: EvalMessage[] | undefined,
): TaskInput {
  const hasInput = input !== undefined;
  const hasMessages = messages !== undefined;

  if (hasInput === hasMessages) {
    throw new Error(
      "Each eval case must define exactly one of `input` or `messages`.",
    );
  }

  if (hasInput) {
    assertString(input, "`input`");
    return input;
  }

  assertValidMessages(messages, "`messages`");
  return messages;
}

export function normalizeEvalInput(input: TaskInput): NormalizedInput {
  if (typeof input === "string") {
    return {
      input,
      inputMessages: [textMessage("user", input)],
    };
  }

  assertValidMessages(input, "Eval input");

  return {
    input: extractTextFromMessages(input),
    inputMessages: input,
  };
}

function getTaskResultVariant(taskOutput: TaskResult): "result" | "messages" {
  const hasResult = "result" in taskOutput && taskOutput.result !== undefined;
  const hasMessages =
    "messages" in taskOutput && taskOutput.messages !== undefined;

  if (hasResult === hasMessages) {
    throw new Error(
      "Task results must define exactly one of `result` or `messages`.",
    );
  }

  return hasResult ? "result" : "messages";
}

export function deriveToolCalls(messages: EvalMessage[]): ToolCall[] {
  const orderedCalls: ToolCall[] = [];
  const byId = new Map<string, ToolCall>();

  function findOpenCall(toolName: string) {
    for (let index = orderedCalls.length - 1; index >= 0; index -= 1) {
      const call = orderedCalls[index];
      if (
        call.name === toolName &&
        call.result === undefined &&
        call.error === undefined
      ) {
        return call;
      }
    }
    return undefined;
  }

  function upsertCall(part: {
    toolName: string;
    toolCallId?: string;
    input?: unknown;
  }) {
    if (part.toolCallId) {
      const existing = byId.get(part.toolCallId);
      if (existing) {
        if (part.input !== undefined) {
          existing.arguments = part.input;
        }
        return existing;
      }
    }

    const openCall = part.toolCallId ? undefined : findOpenCall(part.toolName);
    if (openCall) {
      if (part.input !== undefined) {
        openCall.arguments = part.input;
      }
      return openCall;
    }

    const call: ToolCall = {
      name: part.toolName,
      ...(part.input !== undefined ? { arguments: part.input } : {}),
    };

    orderedCalls.push(call);
    if (part.toolCallId) {
      byId.set(part.toolCallId, call);
    }
    return call;
  }

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-call") {
        upsertCall(part);
        continue;
      }

      if (part.type === "tool-result") {
        const call =
          (part.toolCallId ? byId.get(part.toolCallId) : undefined) ??
          findOpenCall(part.toolName) ??
          upsertCall(part);
        call.result = part.output;
        continue;
      }

      if (part.type === "tool-error") {
        const call =
          (part.toolCallId ? byId.get(part.toolCallId) : undefined) ??
          findOpenCall(part.toolName) ??
          upsertCall(part);
        call.error = part.error ??
          part.output ?? {
            toolName: part.toolName,
          };
      }
    }
  }

  return orderedCalls;
}

export function normalizeTaskOutput(taskOutput: TaskOutput): NormalizedOutput {
  if (typeof taskOutput === "string") {
    return {
      output: taskOutput,
      outputMessages: [textMessage("assistant", taskOutput)],
    };
  }

  if (!isRecord(taskOutput)) {
    throw new Error(
      "Task output must be either a string or an object with `result` or `messages`.",
    );
  }

  const variant = getTaskResultVariant(taskOutput as TaskResult);

  if (variant === "result") {
    assertString(taskOutput.result, "`result`");
    return {
      output: taskOutput.result,
      outputMessages: [textMessage("assistant", taskOutput.result)],
      toolCalls: taskOutput.toolCalls,
    };
  }

  assertValidMessages(taskOutput.messages, "`messages`");

  return {
    output: extractTextFromMessages(taskOutput.messages),
    outputMessages: taskOutput.messages,
    toolCalls: taskOutput.toolCalls ?? deriveToolCalls(taskOutput.messages),
  };
}

export function normalizeScorerPayload(
  input: TaskInput,
  taskOutput: TaskOutput,
): NormalizedScorerPayload {
  const normalizedInput = normalizeEvalInput(input);
  const normalizedOutput = normalizeTaskOutput(taskOutput);

  return {
    ...normalizedInput,
    ...normalizedOutput,
    messages: [
      ...normalizedInput.inputMessages,
      ...normalizedOutput.outputMessages,
    ],
  };
}

export function normalizeEvaluateOutput(taskOutput: TaskOutput): {
  messages: EvalMessage[];
  output: string;
  toolCalls?: ToolCall[];
} {
  const normalizedOutput = normalizeTaskOutput(taskOutput);

  return {
    messages: normalizedOutput.outputMessages,
    output: normalizedOutput.output,
    toolCalls: normalizedOutput.toolCalls,
  };
}

function extractTextFromPart(part: EvalPart): string {
  switch (part.type) {
    case "text":
    case "reasoning":
      return part.text;
    default:
      return EMPTY_TEXT;
  }
}

export function extractTextFromMessages(messages: EvalMessage[]): string {
  return messages
    .flatMap((message) => message.parts.map(extractTextFromPart))
    .filter(Boolean)
    .join("\n");
}

function summarizeUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (value instanceof Error) {
    return value.message;
  }

  try {
    const json = JSON.stringify(value, null, 2);
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

function formatPartForDisplay(part: EvalPart): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "reasoning":
      return `[reasoning]\n${part.text}`;
    case "image":
      return `[image${part.mediaType ? ` ${part.mediaType}` : ""}]`;
    case "file":
      return `[file${part.filename ? ` ${part.filename}` : ""}${part.mediaType ? ` ${part.mediaType}` : ""}]`;
    case "tool-call":
      return `[tool-call ${part.toolName}]${part.input !== undefined ? ` ${summarizeUnknown(part.input)}` : ""}`;
    case "tool-result":
      return `[tool-result ${part.toolName}] ${summarizeUnknown(part.output)}`;
    case "tool-error":
      return `[tool-error ${part.toolName}] ${summarizeUnknown(part.error ?? part.output)}`;
    case "source":
      return `[source] ${summarizeUnknown(part.source ?? part)}`;
  }
}

export function formatMessages(messages: EvalMessage[]): string {
  if (messages.length === 0) {
    return "(empty transcript)";
  }

  return messages
    .map((message) => {
      const heading = `## ${message.role}`;
      const body = message.parts.length
        ? message.parts.map(formatPartForDisplay).join("\n\n")
        : "(empty message)";
      return `${heading}\n\n${body}`;
    })
    .join("\n\n");
}

export function formatEvalValue(value: unknown): string {
  if (typeof value === "string") {
    return wrapText(value);
  }

  if (isEvalMessageArray(value)) {
    return formatMessages(value);
  }

  return wrapText(summarizeUnknown(value));
}

function pushJudgeText(content: Array<any>, text: string) {
  if (text.length === 0) {
    return;
  }

  const lastPart = content[content.length - 1];
  if (lastPart?.type === "text") {
    lastPart.text += text;
    return;
  }

  content.push({ type: "text", text });
}

export function toJudgeUserMessage(messages: EvalMessage[]) {
  const visibleMessages = messages
    .filter(
      (message) => message.role === "user" || message.role === "assistant",
    )
    .map((message) => ({
      ...message,
      parts: message.parts.filter(
        (part) =>
          part.type === "text" || part.type === "image" || part.type === "file",
      ),
    }))
    .filter((message) => message.parts.length > 0);

  const content: Array<any> = [];

  if (visibleMessages.length === 0) {
    content.push({
      type: "text",
      text: "(no user-facing transcript)",
    });
    return { role: "user" as const, content };
  }

  visibleMessages.forEach((message, index) => {
    if (index > 0) {
      pushJudgeText(content, "\n\n");
    }

    pushJudgeText(content, `[${message.role.toUpperCase()}]\n`);

    if (message.parts.length === 0) {
      pushJudgeText(content, "(empty message)");
      return;
    }

    message.parts.forEach((part, partIndex) => {
      if (partIndex > 0) {
        pushJudgeText(content, "\n");
      }

      switch (part.type) {
        case "text":
          pushJudgeText(content, `${part.text}\n`);
          return;
        case "image":
          pushJudgeText(
            content,
            `[image${part.mediaType ? ` ${part.mediaType}` : ""}]\n`,
          );
          content.push({
            type: "image",
            image: part.image,
            ...(part.mediaType ? { mediaType: part.mediaType } : {}),
          });
          pushJudgeText(content, "\n");
          return;
        case "file":
          pushJudgeText(
            content,
            `[file${part.filename ? ` ${part.filename}` : ""}${part.mediaType ? ` ${part.mediaType}` : ""}]\n`,
          );
          content.push({
            type: "file",
            data: part.data,
            mediaType: part.mediaType,
            ...(part.filename ? { filename: part.filename } : {}),
          });
          pushJudgeText(content, "\n");
          return;
      }
    });
  });

  const lastPart = content[content.length - 1];
  if (lastPart?.type === "text") {
    lastPart.text = lastPart.text.trimEnd();
  }

  return { role: "user" as const, content };
}

export function getDefaultTestName(input: TaskInput): string {
  if (typeof input === "string") {
    return input;
  }

  const firstText = extractTextFromMessages(input).trim();
  return firstText.length > 0 ? firstText : "message chain";
}
