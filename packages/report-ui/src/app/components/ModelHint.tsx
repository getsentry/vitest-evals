import { type ModelSuggestion, suggestionLabel } from "../suggest-model";
import { InstantTooltip } from "./InstantTooltip";

export function ModelHint({ suggestion }: { suggestion: ModelSuggestion }) {
  return (
    <InstantTooltip content={suggestion.reason}>
      <span
        className="inline-flex max-w-full items-center gap-1 text-[0.7rem] font-medium text-warn"
        title={suggestion.reason}
      >
        <span aria-hidden="true">!</span>
        <span className="truncate">{suggestionLabel(suggestion)}</span>
      </span>
    </InstantTooltip>
  );
}
