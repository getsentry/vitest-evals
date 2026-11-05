import type { ReportCase } from "@vitest-evals/core";
import {
  caseDelta,
  caseModelVariants,
  caseSiblings,
  formatSignedScore,
  formatSignedUsd,
  judgeSpread,
  trialStats,
} from "../compare";
import {
  caseModel,
  compactValue,
  formatDuration,
  formatNumber,
} from "../model";
import { estimateUsageCost, formatUsd } from "../pricing";
import { useReportMeta } from "../report-meta";
import { EmptyState } from "../ui";
import { DetailContent, DetailSection } from "./DetailLayout";
import { ScoreValue, StatusMark } from "./ReportPrimitives";

export function CompareTab({
  baselineCases,
  cases,
  testCase,
}: {
  baselineCases: ReportCase[];
  cases: ReportCase[];
  testCase: ReportCase;
}) {
  const { pricing } = useReportMeta();
  const siblings = caseSiblings(testCase, cases);
  const variants = caseModelVariants(testCase, cases);
  const delta = caseDelta(testCase, baselineCases, pricing);
  const trials = trialStats(testCase, cases);
  const spread = judgeSpread(testCase);
  const rows = uniqueCases([testCase, ...siblings, ...variants]);

  return (
    <DetailContent>
      <DetailSection title="This case">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            vs baseline{" "}
            <strong className="font-semibold">
              {delta ? formatSignedScore(delta.score) : "n/a"}
            </strong>
            {delta?.costUsd !== undefined ? (
              <span className="text-muted">
                {" "}
                · {formatSignedUsd(delta.costUsd)}
              </span>
            ) : null}
          </span>
          {trials.count > 1 ? (
            <span>
              {trials.count} trials
              {trials.stdevScore !== undefined
                ? ` · σ ${formatSignedScore(trials.stdevScore).replace("+", "")}`
                : ""}
            </span>
          ) : null}
          {spread.count > 1 && spread.stdevScore !== undefined ? (
            <span>judge σ {Math.round(spread.stdevScore * 100)}pp</span>
          ) : null}
        </div>
      </DetailSection>
      <DetailSection title="Variants">
        {rows.length <= 1 ? (
          <EmptyState>
            Load another run or model to compare this case.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
              <thead className="text-left text-xs font-semibold text-muted-strong">
                <tr>
                  <th className="border-b border-line-subtle px-2 py-2">Run</th>
                  <th className="border-b border-line-subtle px-2 py-2">
                    Model
                  </th>
                  <th className="w-[88px] border-b border-line-subtle px-2 py-2 text-right">
                    Score
                  </th>
                  <th className="w-[88px] border-b border-line-subtle px-2 py-2 text-right">
                    Δ
                  </th>
                  <th className="w-[88px] border-b border-line-subtle px-2 py-2 text-right">
                    Cost
                  </th>
                  <th className="w-[88px] border-b border-line-subtle px-2 py-2 text-right">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowDelta = caseDelta(row, baselineCases, pricing);
                  const cost = estimateUsageCost(
                    row.harness?.run?.usage ?? {},
                    pricing,
                  );
                  return (
                    <tr key={row.id}>
                      <td className="border-b border-line-subtle px-2 py-2">
                        <div className="flex items-center gap-2">
                          <StatusMark showLabel={false} status={row.status} />
                          <span className="truncate">
                            {compactValue(row.source ?? row.runId, 36) ||
                              row.runId}
                            {row.id === testCase.id ? " · this" : ""}
                          </span>
                        </div>
                      </td>
                      <td className="truncate border-b border-line-subtle px-2 py-2 font-mono text-xs">
                        {caseModel(row) ?? "n/a"}
                      </td>
                      <td className="border-b border-line-subtle px-2 py-2 text-right">
                        <ScoreValue score={row.eval?.avgScore} />
                      </td>
                      <td className="border-b border-line-subtle px-2 py-2 text-right font-mono text-xs tabular-nums">
                        {formatSignedScore(rowDelta?.score)}
                      </td>
                      <td className="border-b border-line-subtle px-2 py-2 text-right font-mono text-xs tabular-nums">
                        {cost ? formatUsd(cost.totalUsd) : "n/a"}
                      </td>
                      <td className="border-b border-line-subtle px-2 py-2 text-right font-mono text-xs tabular-nums">
                        {formatDuration(row.durationMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>
      <DetailSection title="Tokens">
        <p className="text-sm text-muted">
          This case {formatNumber(testCase.harness?.run?.usage?.totalTokens)}{" "}
          tokens
          {delta?.baseline
            ? ` · baseline ${formatNumber(delta.baseline.harness?.run?.usage?.totalTokens)}`
            : ""}
          .
        </p>
      </DetailSection>
    </DetailContent>
  );
}

function uniqueCases(cases: ReportCase[]) {
  const seen = new Set<string>();
  const unique: ReportCase[] = [];
  for (const testCase of cases) {
    if (seen.has(testCase.id)) {
      continue;
    }
    seen.add(testCase.id);
    unique.push(testCase);
  }
  return unique;
}
