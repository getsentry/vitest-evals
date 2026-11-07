import { type ModelSuggestion, suggestionLabel } from "../suggest-model";
import { InstantTooltip } from "./InstantTooltip";

export function ModelHint({ suggestion }: { suggestion: ModelSuggestion }) {
  return (
    <InstantTooltip content={suggestionLabel(suggestion)}>
      <span
        className="inline-flex size-4 items-center justify-center rounded-sm text-[0.7rem] font-bold text-warn"
        aria-label={suggestionLabel(suggestion)}
        title={suggestion.reason}
      >
        !
      </span>
    </InstantTooltip>
  );
}
