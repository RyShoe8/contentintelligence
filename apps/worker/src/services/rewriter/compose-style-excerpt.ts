import {
  sanitizeArticleHtmlForLearning,
  stripHtmlToPlainText,
  writerHtmlParagraphs,
  type ComposeStyleKit,
} from "@content-resourcer/db";
import type { ArticleRewriteExample } from "./types.js";

export const COMPOSE_PER_EXAMPLE_CHARS = 4500;
export const COMPOSE_PER_EXAMPLE_CHARS_FEW = 9000;
export const COMPOSE_MAX_TOTAL_CHARS = 14000;
export const COMPOSE_STYLE_PROMPT_MAX_CHARS = 7000;
const RHYTHM_SAMPLE_CHARS = 600;
const OPENING_PARAGRAPH_COUNT = 4;
const CLOSING_PARAGRAPH_COUNT = 3;
const FEW_EXAMPLES_MAX = 2;

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

function openingFromKitOrHtml(kit: ComposeStyleKit | undefined, sanitized: string): string {
  if (kit?.openingParagraphs.length) {
    return kit.openingParagraphs.slice(0, OPENING_PARAGRAPH_COUNT).join("\n\n");
  }
  const paragraphs = writerHtmlParagraphs(sanitized)
    .slice(0, OPENING_PARAGRAPH_COUNT)
    .map((p) => stripHtmlToPlainText(p).trim())
    .filter((t) => t.length >= 15);
  return paragraphs.join("\n\n");
}

function signatureBlock(kit: ComposeStyleKit | undefined): string {
  if (!kit?.signatureParagraphs.length) return "";
  const lines = kit.signatureParagraphs.slice(0, 6).map((p) => `- ${p}`);
  return `Signature paragraphs:\n${lines.join("\n")}\n\n`;
}

function closingFromHtml(sanitized: string): string {
  const paragraphs = writerHtmlParagraphs(sanitized)
    .map((p) => stripHtmlToPlainText(p).trim())
    .filter((t) => t.length >= 10);
  if (paragraphs.length <= OPENING_PARAGRAPH_COUNT) return "";
  return paragraphs.slice(-CLOSING_PARAGRAPH_COUNT).join("\n\n");
}

function rhythmSample(kit: ComposeStyleKit | undefined, sanitized: string): string {
  const sample =
    kit?.rhythmSample ??
    (() => {
      const plain = stripHtmlToPlainText(sanitized);
      if (plain.length < 400) return "";
      const midStart = Math.floor(plain.length * 0.35);
      return plain.slice(midStart, midStart + RHYTHM_SAMPLE_CHARS).trim();
    })();
  return sample.length >= 80 ? `\n\nMid-article rhythm sample:\n${sample}` : "";
}

const FULL_BODY_MIN_REMAINING = 1000;

/** Rich voice excerpt: headings + signatures + opening + rhythm + closing, plus full body when budget allows. */
export function buildRichExampleExcerpt(
  html: string,
  maxChars: number,
  kit?: ComposeStyleKit,
): string {
  const sanitized = sanitizeArticleHtmlForLearning(html);
  if (!sanitized.trim()) return "";

  const headings = kit?.headings.length ? kit.headings : extractHeadingsFromExampleHtml(sanitized);
  const headingBlock =
    headings.length > 0 ? `Headings:\n${headings.map((h) => `- ${h}`).join("\n")}\n\n` : "";

  const sigBlock = signatureBlock(kit);
  const opening = openingFromKitOrHtml(kit, sanitized);
  const openingBlock = opening ? `Opening:\n${opening}` : "";
  const midBlock = rhythmSample(kit, sanitized);
  const closing = closingFromHtml(sanitized);
  const closingBlock = closing ? `\n\nClosing:\n${closing}` : "";

  let combined = `${headingBlock}${sigBlock}${openingBlock}${midBlock}${closingBlock}`;

  const remaining = maxChars - combined.length;
  if (remaining > FULL_BODY_MIN_REMAINING) {
    const fullPlain = stripHtmlToPlainText(sanitized).trim();
    if (fullPlain.length > 400) {
      const header = "\n\nFull article body (voice reference):\n";
      const budget = remaining - header.length;
      const body = fullPlain.length > budget ? `${fullPlain.slice(0, budget)}…` : fullPlain;
      combined += `${header}${body}`;
    }
  }

  return combined.length > maxChars ? `${combined.slice(0, maxChars)}…` : combined;
}

/** Headings + voice kit from style examples for rhythm anchoring. */
export function buildComposeStyleExampleExcerpt(
  examples: ArticleRewriteExample[],
): string | undefined {
  const selected = examples.filter((ex) => ex.html?.trim());
  if (!selected.length) return undefined;

  const perExampleChars =
    selected.length <= FEW_EXAMPLES_MAX ? COMPOSE_PER_EXAMPLE_CHARS_FEW : COMPOSE_PER_EXAMPLE_CHARS;
  const blocks: string[] = [];
  let total = 0;
  for (const ex of selected) {
    const header = `Example ${blocks.length + 1} (reference only — do not copy title or chrome):\n`;
    const remaining = COMPOSE_MAX_TOTAL_CHARS - total - header.length;
    if (remaining <= 200) break;
    const sliceLen = Math.min(perExampleChars, remaining);
    const body = buildRichExampleExcerpt(ex.html, sliceLen, ex.composeStyleKit);
    if (!body.trim()) continue;
    blocks.push(`${header}${body}`);
    total += header.length + body.length;
  }

  return blocks.length ? blocks.join("\n\n") : undefined;
}

export function trimComposeStyleExcerptForPrompt(excerpt: string | undefined): string | undefined {
  if (!excerpt?.trim()) return undefined;
  const trimmed = excerpt.trim();
  return trimmed.length > COMPOSE_STYLE_PROMPT_MAX_CHARS
    ? `${trimmed.slice(0, COMPOSE_STYLE_PROMPT_MAX_CHARS)}…`
    : trimmed;
}
