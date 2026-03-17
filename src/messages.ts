import { wrapText } from "./wrapText";

export type ToolCall = {
  name: string;
  arguments?: unknown;
  [key: string]: unknown;
};

export type TranscriptTextPart = {
  type: "text";
  text: string;
};

export type TranscriptImagePart = {
  type: "image";
  image: unknown;
  mediaType?: string;
};

export type TranscriptFilePart = {
  type: "file";
  data: unknown;
  mediaType: string;
  filename?: string;
};

export type TranscriptPart =
  | TranscriptTextPart
  | TranscriptImagePart
  | TranscriptFilePart;

export type TranscriptMessage = {
  role: "user" | "assistant";
  parts: TranscriptPart[];
};

export type Transcript = TranscriptMessage[];

export type TaskInput = string | Transcript;

export type TaskResult = {
  transcript: Transcript;
  toolCalls?: ToolCall[];
};

export type TaskOutput = string | TaskResult;

export type EvalDataInput =
  | {
      input: string;
      transcript?: never;
    }
  | {
      transcript: Transcript;
      input?: never;
    };

interface NormalizedInput {
  input: string;
  inputTranscript: Transcript;
}

interface NormalizedOutput {
  output: string;
  outputTranscript: Transcript;
  toolCalls?: ToolCall[];
}

export interface NormalizedScorerPayload {
  input: string;
  output: string;
  transcript: Transcript;
  toolCalls?: ToolCall[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTranscript(value: unknown): value is Transcript {
  return (
    Array.isArray(value) &&
    value.every(
      (message) =>
        isRecord(message) &&
        (message.role === "user" || message.role === "assistant") &&
        Array.isArray(message.parts),
    )
  );
}

function textMessage(
  role: TranscriptMessage["role"],
  text: string,
): TranscriptMessage {
  return {
    role,
    parts: [{ type: "text", text }],
  };
}

function assertValidTranscript(
  transcript: unknown,
  fieldName: string,
): asserts transcript is Transcript {
  if (!isTranscript(transcript)) {
    throw new Error(`${fieldName} must be an array of transcript messages.`);
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
  transcript: Transcript | undefined,
): TaskInput {
  const hasInput = input !== undefined;
  const hasTranscript = transcript !== undefined;

  if (hasInput === hasTranscript) {
    throw new Error(
      "Each eval case must define exactly one of `input` or `transcript`.",
    );
  }

  if (hasInput) {
    assertString(input, "`input`");
    return input;
  }

  assertValidTranscript(transcript, "`transcript`");
  return transcript;
}

export function normalizeEvalInput(input: TaskInput): NormalizedInput {
  if (typeof input === "string") {
    return {
      input,
      inputTranscript: [textMessage("user", input)],
    };
  }

  assertValidTranscript(input, "Eval input");

  return {
    input: extractTextFromTranscript(input),
    inputTranscript: input,
  };
}

export function normalizeTaskOutput(taskOutput: TaskOutput): NormalizedOutput {
  if (typeof taskOutput === "string") {
    return {
      output: taskOutput,
      outputTranscript: [textMessage("assistant", taskOutput)],
    };
  }

  if (!isRecord(taskOutput) || !("transcript" in taskOutput)) {
    throw new Error(
      "Task output must be either a string or an object with `transcript`.",
    );
  }

  assertValidTranscript(taskOutput.transcript, "`transcript`");

  return {
    output: extractTextFromTranscript(taskOutput.transcript),
    outputTranscript: taskOutput.transcript,
    toolCalls: taskOutput.toolCalls,
  };
}

export function normalizeScorerPayload(
  input: TaskInput,
  taskOutput: TaskOutput,
): NormalizedScorerPayload {
  const normalizedInput = normalizeEvalInput(input);
  const normalizedOutput = normalizeTaskOutput(taskOutput);

  return {
    input: normalizedInput.input,
    output: normalizedOutput.output,
    transcript: [
      ...normalizedInput.inputTranscript,
      ...normalizedOutput.outputTranscript,
    ],
    toolCalls: normalizedOutput.toolCalls,
  };
}

export function normalizeEvaluateOutput(taskOutput: TaskOutput): {
  transcript: Transcript;
  output: string;
} {
  const normalizedOutput = normalizeTaskOutput(taskOutput);

  return {
    transcript: normalizedOutput.outputTranscript,
    output: normalizedOutput.output,
  };
}

function extractTextFromPart(part: TranscriptPart): string {
  return part.type === "text" ? part.text : "";
}

export function extractTextFromTranscript(transcript: Transcript): string {
  return transcript
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

function formatPartForDisplay(part: TranscriptPart): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "image":
      return `[image${part.mediaType ? ` ${part.mediaType}` : ""}]`;
    case "file":
      return `[file${part.filename ? ` ${part.filename}` : ""}${part.mediaType ? ` ${part.mediaType}` : ""}]`;
  }
}

export function formatTranscript(transcript: Transcript): string {
  if (transcript.length === 0) {
    return "(empty transcript)";
  }

  return transcript
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

  if (isTranscript(value)) {
    return formatTranscript(value);
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

export function toJudgeUserMessage(transcript: Transcript) {
  const content: Array<any> = [];

  if (transcript.length === 0) {
    content.push({
      type: "text",
      text: "(empty transcript)",
    });
    return { role: "user" as const, content };
  }

  transcript.forEach((message, index) => {
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

  const firstText = extractTextFromTranscript(input).trim();
  return firstText.length > 0 ? firstText : "transcript";
}
