/**
 * Wraps text to fit within a specified width, breaking at word boundaries.
 *
 * @param text - The text to wrap
 * @param width - The maximum width in characters (default: 80)
 * @returns The wrapped text with line breaks
 *
 * @example
 * ```javascript
 * const wrapped = wrapText("This is a very long text that needs to be wrapped to fit within an 80 character width.", 20);
 * console.log(wrapped);
 * // Output:
 * // This is a very
 * // long text that
 * // needs to be
 * // wrapped to fit
 * // within an 80
 * // character width.
 * ```
 */
export function wrapText(text: string, width = 80): string {
  if (!text || text.length <= width) {
    return text;
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    // If adding this word would exceed the width, start a new line
    if (currentLine.length + word.length + 1 > width) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      // Add the word to the current line
      currentLine += (currentLine ? " " : "") + word;
    }
  }

  // Add the last line if it's not empty
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}
