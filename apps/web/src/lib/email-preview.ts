const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00AD]/g;

/** Strip invisible chars and collapse whitespace for short summaries. */
export function cleanEmailPreview(text: string): string {
  return text
    .replace(ZERO_WIDTH_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip invisible chars but preserve line breaks and paragraph spacing. */
export function cleanEmailPreviewPreserveLayout(text: string): string {
  return text
    .replace(ZERO_WIDTH_RE, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}
