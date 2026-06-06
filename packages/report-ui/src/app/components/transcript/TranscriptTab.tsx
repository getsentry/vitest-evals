import { useMemo, useState } from "react";
import type { HarnessRun } from "@vitest-evals/core";
import { buildTranscript } from "../../model";
import { EmptyState } from "../../ui";
import { DetailContent, DetailSection, EmptyDetail } from "../DetailLayout";
import { TranscriptMessages } from "./TranscriptMessages";

export function TranscriptTab({ run }: { run: HarnessRun | undefined }) {
  if (!run) {
    return <EmptyDetail>No harness run captured</EmptyDetail>;
  }

  return <TranscriptTabContent run={run} />;
}

function TranscriptTabContent({ run }: { run: HarnessRun }) {
  const [search, setSearch] = useState("");
  const transcript = useMemo(() => buildTranscript(run), [run]);

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
        <div className="-mx-5 -mt-4 mb-3 border-b border-line-subtle px-5 pb-3">
          <input
            type="search"
            placeholder="Search transcript…"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            className="h-8 w-full rounded-md border border-line-subtle bg-panel px-3 text-xs text-ink outline-none placeholder:text-muted focus:border-selected-line focus:ring-2 focus:ring-selected"
          />
        </div>
        {transcript.events.length > 0 ? (
          <TranscriptMessages events={transcript.events} search={search} />
        ) : (
          <EmptyState>No transcript messages captured</EmptyState>
        )}
      </DetailSection>
    </DetailContent>
  );
}
