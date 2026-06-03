import { formatJson } from "../../model";

export function TranscriptCodeBlock({ value }: { value: unknown }) {
  if (value === undefined || value === "") {
    return (
      <div className="font-mono text-[0.8rem] leading-snug text-muted">n/a</div>
    );
  }

  return (
    <pre className="max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[4px] border border-line bg-panel p-3 font-mono text-[0.78rem] leading-relaxed text-code">
      {formatJson(value)}
    </pre>
  );
}
