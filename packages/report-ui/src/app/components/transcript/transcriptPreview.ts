export function previewToolValue(value: unknown): string {
  if (!isPreviewableValue(value)) {
    return "no arguments";
  }

  const source =
    typeof value === "string"
      ? value
      : JSON.stringify(value, (_key, nested) =>
          typeof nested === "string" && nested.length > 80
            ? `${nested.slice(0, 77)}...`
            : nested,
        );

  return truncatePreview(source.replace(/\s+/g, " ").trim(), 120);
}

export function previewArgumentValue(value: unknown): string {
  if (value == null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(truncatePreview(value, 48));
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return truncatePreview(JSON.stringify(value).replace(/\s+/g, " ").trim(), 48);
}

export function isPreviewableValue(value: unknown): boolean {
  if (value == null || value === "") {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
}

export function truncatePreview(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 3))}...`
    : value;
}
