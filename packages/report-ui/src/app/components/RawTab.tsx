import type { ReportCase } from "@vitest-evals/core";
import { DetailContent, DetailSection } from "./DetailLayout";
import { JsonBlock } from "./ReportPrimitives";

export function RawTab({ testCase }: { testCase: ReportCase }) {
  return (
    <DetailContent>
      <DetailSection title="Case JSON">
        <JsonBlock value={testCase} />
      </DetailSection>
      {testCase.harness?.run?.artifacts ? (
        <DetailSection title="Artifacts">
          <JsonBlock value={testCase.harness.run.artifacts} />
        </DetailSection>
      ) : null}
      {testCase.harness?.run?.errors?.length ? (
        <DetailSection title="Errors">
          <JsonBlock value={testCase.harness.run.errors} />
        </DetailSection>
      ) : null}
    </DetailContent>
  );
}
