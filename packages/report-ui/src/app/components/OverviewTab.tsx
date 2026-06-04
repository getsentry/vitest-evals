import type { HarnessRun, ReportCase } from "@vitest-evals/core";
import { formatDuration, formatNumber } from "../model";
import { EmptyState } from "../ui";
import { DetailContent, DetailSection } from "./DetailLayout";
import { Fact, FactsGrid, JsonBlock, ScoreValue } from "./ReportPrimitives";

export function OverviewTab({
  testCase,
  run,
}: {
  testCase: ReportCase;
  run: HarnessRun | undefined;
}) {
  return (
    <DetailContent>
      <DetailSection title="Output">
        <JsonBlock value={testCase.eval?.output ?? run?.output} />
      </DetailSection>
      <DetailSection title="Judge evidence">
        <ScoreTable testCase={testCase} />
      </DetailSection>
      <DetailSection title="Usage">
        <UsageGrid run={run} />
      </DetailSection>
      <DetailSection title="Failures">
        {testCase.failureMessages.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
            {testCase.failureMessages.map((message) => (
              <li className="break-words" key={message}>
                {message}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No failure messages</EmptyState>
        )}
      </DetailSection>
    </DetailContent>
  );
}

function ScoreTable({ testCase }: { testCase: ReportCase }) {
  const scores = testCase.eval?.scores ?? [];
  if (scores.length === 0) {
    return <EmptyState>No score records</EmptyState>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] table-fixed border-collapse text-sm">
        <thead className="text-left text-xs font-semibold uppercase text-muted-strong">
          <tr>
            <th className="w-[190px] border-b border-line-subtle px-2 py-2">
              Judge
            </th>
            <th className="w-[92px] border-b border-line-subtle px-2 py-2 text-right">
              Score
            </th>
            <th className="border-b border-line-subtle px-2 py-2">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score, index) => (
            <tr key={`${score.name ?? "score"}-${index}`}>
              <td className="truncate border-b border-line-subtle px-2 py-2">
                {score.name ?? "Score"}
              </td>
              <td className="border-b border-line-subtle px-2 py-2 text-right">
                <ScoreValue score={score.score} />
              </td>
              <td className="border-b border-line-subtle px-2 py-2">
                <ScoreEvidence metadata={score.metadata} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreEvidence({
  metadata,
}: {
  metadata: Record<string, unknown> | undefined;
}) {
  if (!metadata) {
    return <span className="text-muted">n/a</span>;
  }

  const rationale = stringMetadata(metadata.rationale);
  const matchedTools = stringListMetadata(metadata.matchedTools);
  const output = metadata.output;
  const remainingMetadata = omitMetadata(metadata, [
    "rationale",
    "matchedTools",
    "output",
  ]);

  return (
    <div className="grid gap-1.5">
      {rationale ? (
        <p className="max-w-[72ch] text-sm leading-relaxed text-ink">
          {rationale}
        </p>
      ) : null}
      {matchedTools.length > 0 ? (
        <EvidenceLine label="matched tools" value={matchedTools.join(", ")} />
      ) : null}
      {output !== undefined ? (
        <EvidenceLine label="output" value={compactJson(output)} />
      ) : null}
      {Object.keys(remainingMetadata).length > 0 ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-strong outline-none hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-selected-line">
            Metadata
          </summary>
          <code className="mt-1 block break-words font-mono text-xs text-code">
            {compactJson(remainingMetadata)}
          </code>
        </details>
      ) : null}
      {!rationale &&
      matchedTools.length === 0 &&
      output === undefined &&
      Object.keys(remainingMetadata).length === 0 ? (
        <span className="text-muted">n/a</span>
      ) : null}
    </div>
  );
}

function EvidenceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-xs">
      <span className="font-semibold uppercase text-muted-strong">{label}</span>
      <span className="min-w-0 break-words font-mono text-code">{value}</span>
    </div>
  );
}

function UsageGrid({ run }: { run: HarnessRun | undefined }) {
  const usage = run?.usage;
  return (
    <FactsGrid compact>
      <Fact label="Provider" value={usage?.provider ?? "n/a"} />
      <Fact label="Model" value={usage?.model ?? "n/a"} />
      <Fact label="Input" value={formatNumber(usage?.inputTokens)} />
      <Fact label="Output" value={formatNumber(usage?.outputTokens)} />
      <Fact label="Reasoning" value={formatNumber(usage?.reasoningTokens)} />
      <Fact label="Total" value={formatNumber(usage?.totalTokens)} />
      <Fact label="Retries" value={formatNumber(usage?.retries)} />
      <Fact label="Run time" value={formatDuration(run?.timings?.totalMs)} />
    </FactsGrid>
  );
}

function compactJson(value: unknown) {
  const raw = JSON.stringify(value);
  if (!raw) {
    return "";
  }
  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
}

function stringMetadata(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringListMetadata(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item : undefined))
    .filter((item): item is string => Boolean(item));
}

function omitMetadata(
  metadata: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const omitted = new Set(keys);
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !omitted.has(key)),
  );
}
