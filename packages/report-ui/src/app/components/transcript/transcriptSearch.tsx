import { type ReactNode, createContext, useContext } from "react";
import { formatJson, type TranscriptEvent } from "../../model";

// ─── Context ────────────────────────────────────────────────────────────────

type TranscriptSearchContextValue = {
  /** Raw query string as typed by the user. */
  query: string;
  /** Trimmed, lowercase query used for matching. */
  normalizedQuery: string;
  /** True when the normalised query is non-empty. */
  active: boolean;
};

const defaultValue: TranscriptSearchContextValue = {
  query: "",
  normalizedQuery: "",
  active: false,
};

const TranscriptSearchContext =
  createContext<TranscriptSearchContextValue>(defaultValue);

export function TranscriptSearchProvider({
  children,
  query,
}: {
  children: ReactNode;
  query: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  return (
    <TranscriptSearchContext.Provider
      value={{ query, normalizedQuery, active: normalizedQuery.length > 0 }}
    >
      {children}
    </TranscriptSearchContext.Provider>
  );
}

export function useTranscriptSearch() {
  return useContext(TranscriptSearchContext);
}

// ─── Highlighting ────────────────────────────────────────────────────────────

/** Renders text with case-insensitive query matches wrapped in a highlight mark. */
export function HighlightText({ text }: { text: string }) {
  const { normalizedQuery, active } = useTranscriptSearch();

  if (!active || !text) return <>{text}</>;

  const lower = text.toLowerCase();
  if (!lower.includes(normalizedQuery)) return <>{text}</>;

  const parts: ReactNode[] = [];
  let last = 0;
  let idx = lower.indexOf(normalizedQuery);
  let key = 0;

  while (idx !== -1) {
    if (idx > last) {
      parts.push(text.slice(last, idx));
    }
    parts.push(
      <mark
        key={key++}
        className="rounded-[2px] bg-search-mark px-0.5 text-inherit"
      >
        {text.slice(idx, idx + normalizedQuery.length)}
      </mark>,
    );
    last = idx + normalizedQuery.length;
    idx = lower.indexOf(normalizedQuery, last);
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return <>{parts}</>;
}

// ─── Matching ────────────────────────────────────────────────────────────────

/** Returns true if any rendered field of the event contains the normalised query. */
export function eventMatchesSearch(
  event: TranscriptEvent,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;

  if (event.kind === "message") {
    return textContains(formatJson(event.content), normalizedQuery);
  }

  if (event.kind === "tool") {
    return (
      textContains(event.name, normalizedQuery) ||
      textContains(event.callId, normalizedQuery) ||
      textContains(formatJson(event.arguments), normalizedQuery) ||
      textContains(formatJson(event.result), normalizedQuery) ||
      textContains(formatJson(event.error), normalizedQuery)
    );
  }

  if (event.kind === "span") {
    const op = event.operation;
    return (
      textContains(op.label, normalizedQuery) ||
      textContains(op.name, normalizedQuery) ||
      textContains(op.query, normalizedQuery) ||
      textContains(op.error?.type, normalizedQuery) ||
      textContains(op.error?.message, normalizedQuery)
    );
  }

  return false;
}

function textContains(text: string | undefined, query: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(query);
}
