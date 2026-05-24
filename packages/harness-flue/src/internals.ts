import type { SimpleToolCallRecord } from "vitest-evals/harness";
import type {
  FlueEvent,
  PromptResponse,
  PromptResultResponse,
  PromptUsage,
} from "@flue/runtime";

export interface CollectedTurn {
  model?: string;
  usage?: PromptUsage;
  durationMs: number;
}

const INTERNAL_TOOLS = new Set(["finish", "give_up"]);

export function createEventCollector() {
  const toolCalls: SimpleToolCallRecord[] = [];
  const turns: CollectedTurn[] = [];
  const pendingArgs = new Map<string, unknown>();

  const handler = (event: FlueEvent): void => {
    if (event.type === "tool_start") {
      pendingArgs.set(event.toolCallId, event.args);
    } else if (
      event.type === "tool_call" &&
      !INTERNAL_TOOLS.has(event.toolName)
    ) {
      const args = pendingArgs.get(event.toolCallId);
      pendingArgs.delete(event.toolCallId);
      const resultText =
        event.result?.content?.[0]?.type === "text"
          ? event.result.content[0].text
          : undefined;
      toolCalls.push({
        name: event.toolName,
        arguments: args,
        result: event.isError ? undefined : resultText,
        error: event.isError ? resultText : undefined,
      });
    } else if (event.type === "turn") {
      turns.push({
        model: event.model,
        usage: event.usage,
        durationMs: event.durationMs,
      });
    }
  };

  return { toolCalls, turns, handler };
}

export function aggregateUsage(turns: CollectedTurn[]): {
  input: number;
  output: number;
  totalTokens: number;
} {
  let input = 0;
  let output = 0;
  let totalTokens = 0;
  for (const turn of turns) {
    if (turn.usage) {
      input += turn.usage.input;
      output += turn.usage.output;
      totalTokens += turn.usage.totalTokens;
    }
  }
  return { input, output, totalTokens };
}

export function extractModel(turns: CollectedTurn[]): string | undefined {
  for (const turn of turns) {
    if (turn.model) return turn.model;
  }
  return undefined;
}

export function splitModelId(modelId: string): [string, string] {
  const slash = modelId.indexOf("/");
  if (slash === -1) return [modelId, modelId];
  return [modelId.slice(0, slash), modelId.slice(slash + 1)];
}

export function extractOutput(
  response: PromptResponse | PromptResultResponse<any>,
): any {
  if ("data" in response) return response.data;
  if ("text" in response) return response.text;
  return undefined;
}
