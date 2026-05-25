const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00AD]/g;

/** Strip invisible chars and collapse whitespace for email preview display. */
export function cleanEmailPreview(text: string): string {
  return text
    .replace(ZERO_WIDTH_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}
