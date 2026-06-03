import {
  formatDuration,
  formatNumber,
  type TranscriptOperation,
} from "../../model";
import { cx } from "../../ui";
import { JsonBlock } from "../ReportPrimitives";

export function TranscriptOperations({
  operations,
}: {
  operations: TranscriptOperation[];
}) {
  return (
    <div className="grid gap-2">
      {operations.map((operation) => (
        <TranscriptOperationRow key={operation.id} operation={operation} />
      ))}
    </div>
  );
}

function TranscriptOperationRow({
  operation,
}: {
  operation: TranscriptOperation;
}) {
  return (
    <article
      className={cx("border-l-2 py-2 pl-3", operationToneClass(operation))}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase text-muted-strong">
            {operation.label}
          </span>
          <strong className="mt-0.5 block truncate text-sm">
            {operation.name}
          </strong>
        </div>
        <span className="shrink-0 text-xs text-muted">
          {formatDuration(operation.durationMs)}
        </span>
      </div>
      <MetadataLine items={operationMetadata(operation)} />
      {operation.query ? (
        <p className="mt-2 text-sm text-ink">{operation.query}</p>
      ) : null}
      {operation.error ? (
        <p className="mt-2 text-sm text-fail">
          {operation.error.type ? `${operation.error.type}: ` : ""}
          {operation.error.message}
        </p>
      ) : null}
      <PayloadDetails
        payloads={[
          { label: "Arguments", value: operation.arguments },
          { label: "Result", value: operation.result },
          { label: "Documents", value: operation.documents },
          { label: "Attributes", value: operation.attributes },
        ]}
      />
    </article>
  );
}

function MetadataLine({ items }: { items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function PayloadDetails({
  payloads,
}: {
  payloads: Array<{ label: string; value: unknown }>;
}) {
  const payloadItems = payloads.filter(
    (payload) => payload.value !== undefined && payload.value !== "",
  );
  if (payloadItems.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 grid gap-2">
      {payloadItems.map((payload) => (
        <details className="group" key={payload.label}>
          <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-strong outline-none group-open:text-ink">
            {payload.label}
          </summary>
          <div className="mt-2">
            <JsonBlock value={payload.value} />
          </div>
        </details>
      ))}
    </div>
  );
}

function operationToneClass(operation: TranscriptOperation) {
  if (operation.status === "error" || operation.error) {
    return "border-l-fail-line";
  }
  switch (operation.kind) {
    case "tool":
      return "border-l-pass-line";
    case "retrieval":
      return "border-l-warn";
    case "model":
    case "agent":
      return "border-l-trace";
    default:
      return "border-l-line";
  }
}

function operationMetadata(operation: TranscriptOperation) {
  return [
    operation.provider ? `provider ${operation.provider}` : undefined,
    operation.model ? `model ${operation.model}` : undefined,
    tokenMetadata(operation),
    operation.status ? `status ${operation.status}` : undefined,
  ].filter((item): item is string => Boolean(item));
}

function tokenMetadata(operation: TranscriptOperation) {
  const parts = [
    operation.inputTokens !== undefined
      ? `${formatNumber(operation.inputTokens)} input`
      : undefined,
    operation.outputTokens !== undefined
      ? `${formatNumber(operation.outputTokens)} output`
      : undefined,
    operation.reasoningTokens !== undefined
      ? `${formatNumber(operation.reasoningTokens)} reasoning`
      : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? `tokens ${parts.join(" / ")}` : undefined;
}
