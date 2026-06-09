import { sanitizeArticleHtmlForLearning, stripHtmlToPlainText } from "@content-resourcer/db";
import type { ArticleRewriteExample } from "./types.js";

const COMPOSE_PER_EXAMPLE_CHARS = 3500;
const COMPOSE_MAX_TOTAL_CHARS = 7000;
const OPENING_CHARS = 800;

export function extractHeadingsFromExampleHtml(html: string): string[] {
  const headings: string[] = [];
  const re = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = stripHtmlToPlainText(match[1] ?? "").trim();
    if (text.length >= 3 && text.length <= 120) headings.push(text);
  }
  return headings;
}

function midArticleSample(sanitized: string, maxChars: number): string {
  const plain = stripHtmlToPlainText(sanitized);
  if (plain.length < 400) return "";
  const midStart = Math.floor(plain.length * 0.35);
  const sample = plain.slice(midStart, midStart + maxChars).trim();
  return sample.length >= 80 ? sample : "";
}

/** Rich voice excerpt: headings + opening + mid-article rhythm sample. */
export function buildRichExampleExcerpt(html: string, maxChars: number): string {
  const sanitized = sanitizeArticleHtmlForLearning(html);
  if (!sanitized.trim()) return "";

  const headings = extractHeadingsFromExampleHtml(sanitized);
  const headingBlock =
    headings.length > 0 ? `Headings:\n${headings.map((h) => `- ${h}`).join("\n")}\n\n` : "";

  const opening = sanitized.length > OPENING_CHARS ? sanitized.slice(0, OPENING_CHARS) : sanitized;
  const mid = midArticleSample(sanitized, 400);
  const midBlock = mid ? `\n\nMid-article rhythm sample:\n${mid}` : "";

  const combined = `${headingBlock}Opening:\n${opening}${midBlock}`;
  return combined.length > maxChars ? `${combined.slice(0, maxChars)}…` : combined;
}

/** Headings + opening body from style examples for rhythm anchoring. */
export function buildComposeStyleExampleExcerpt(
  examples: ArticleRewriteExample[],
): string | undefined {
  const selected = examples.filter((ex) => ex.html?.trim());
  if (!selected.length) return undefined;

  const blocks: string[] = [];
  let total = 0;
  for (const ex of selected) {
    const header = `Example ${blocks.length + 1} (reference only — do not copy title or chrome):\n`;
    const remaining = COMPOSE_MAX_TOTAL_CHARS - total - header.length;
    if (remaining <= 200) break;
    const sliceLen = Math.min(COMPOSE_PER_EXAMPLE_CHARS, remaining);
    const body = buildRichExampleExcerpt(ex.html, sliceLen);
    if (!body.trim()) continue;
    blocks.push(`${header}${body}`);
    total += header.length + body.length;
  }

  return blocks.length ? blocks.join("\n\n") : undefined;
}
