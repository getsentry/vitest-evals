import type { Score } from "./shared";

/**
 * Temporary legacy formatter helpers.
 *
 * Keep these local to the scorer-first compatibility layer so legacy can be
 * deleted without touching the harness-first entrypoint.
 */

/** Wraps scorer output into fixed-width lines for legacy failure messages. */
export function wrapText(text: string, width = 80): string {
  if (!text || text.length <= width) {
    return text;
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 > width) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

/** Formats legacy scorer results for matcher and assertion output. */
export function formatScores(scores: (Score & { name: string })[]) {
  return scores
    .map((score) => {
      const scoreLine = `${score.name || "Unknown"} [${(score.score ?? 0).toFixed(1)}]`;
      if (
        ((score.score ?? 0) < 1.0 && score.metadata?.rationale) ||
        score.metadata?.output
      ) {
        let formattedOutput = "";
        if (score.metadata?.output !== undefined) {
          const output = score.metadata.output;
          formattedOutput =
            typeof output === "string"
              ? `\noutput  ${wrapText(output)}`
              : `\noutput  ${wrapText(JSON.stringify(output, null, 2))}`;
        }

        return `${scoreLine}${
          score.metadata?.rationale
            ? `\nreason  ${wrapText(score.metadata.rationale)}`
            : ""
        }${formattedOutput}`;
      }
      return scoreLine;
    })
    .join("\n\n");
}
