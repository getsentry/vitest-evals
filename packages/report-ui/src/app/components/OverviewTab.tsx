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
      <DetailSection title="Scores">
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
            <th className="border-b border-line-subtle px-2 py-2">Metadata</th>
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
                {score.metadata ? (
                  <code className="break-words font-mono text-xs">
                    {compactJson(score.metadata)}
                  </code>
                ) : (
                  <span className="text-muted">n/a</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
