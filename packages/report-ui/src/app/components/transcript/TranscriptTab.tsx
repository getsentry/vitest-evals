import type { HarnessRun } from "@vitest-evals/core";
import { buildTranscript } from "../../model";
import { EmptyState } from "../../ui";
import { DetailContent, DetailSection, EmptyDetail } from "../DetailLayout";
import { TranscriptMessages } from "./TranscriptMessages";

export function TranscriptTab({ run }: { run: HarnessRun | undefined }) {
  if (!run) {
    return <EmptyDetail>No harness run captured</EmptyDetail>;
  }

  const transcript = buildTranscript(run);

  return (
    <DetailContent>
      <DetailSection
        title="Transcript"
        action={
          <span className="text-xs text-muted">
            {run.session.provider ?? run.usage.provider ?? "provider n/a"}
            {run.session.model || run.usage.model
              ? ` / ${run.session.model ?? run.usage.model}`
              : ""}
          </span>
        }
      >
        {transcript.events.length > 0 ? (
          <TranscriptMessages events={transcript.events} />
        ) : (
          <EmptyState>No transcript messages captured</EmptyState>
        )}
      </DetailSection>
    </DetailContent>
  );
}
