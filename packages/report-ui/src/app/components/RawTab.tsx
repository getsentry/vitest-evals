import type { ReportCase } from "@vitest-evals/core";
import { useState } from "react";
import { DetailContent, DetailSection } from "./DetailLayout";
import { JsonInspector } from "./JsonInspector";

export function RawTab({ testCase }: { testCase: ReportCase }) {
  const [mode, setMode] = useState<"tree" | "text">("tree");

  return (
    <DetailContent>
      <DetailSection title="Case JSON">
        <JsonInspector mode={mode} value={testCase} onModeChange={setMode} />
      </DetailSection>
      {testCase.harness?.run?.artifacts ? (
        <DetailSection title="Artifacts">
          <JsonInspector
            mode={mode}
            value={testCase.harness.run.artifacts}
            onModeChange={setMode}
          />
        </DetailSection>
      ) : null}
      {testCase.harness?.run?.errors?.length ? (
        <DetailSection title="Errors">
          <JsonInspector
            mode={mode}
            value={testCase.harness.run.errors}
            onModeChange={setMode}
          />
        </DetailSection>
      ) : null}
    </DetailContent>
  );
}
