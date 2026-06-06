import { formatJson } from "../../model";
import { HighlightText } from "./transcriptSearch";

export function TranscriptCodeBlock({ value }: { value: unknown }) {
  if (value === undefined || value === "") {
    return (
      <div className="font-mono text-[0.8rem] leading-snug text-muted">n/a</div>
    );
  }

  const text = formatJson(value);

  return (
    <pre className="max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[4px] border border-line bg-panel p-3 font-mono text-[0.78rem] leading-relaxed text-code">
      <HighlightText text={text} />
    </pre>
  );
}
