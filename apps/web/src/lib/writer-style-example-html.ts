const HTML_TAG_RE = /<[a-z][\s\S]*>/i;

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Normalize pasted blog content into an HTML fragment for style examples. */
export function writerStyleExampleHtmlFromPaste(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (HTML_TAG_RE.test(trimmed)) return trimmed;

  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return `<p>${escapeHtmlText(trimmed)}</p>`;
  }

  return paragraphs
    .map((p) => `<p>${escapeHtmlText(p.replace(/\n/g, " "))}</p>`)
    .join("\n");
}
