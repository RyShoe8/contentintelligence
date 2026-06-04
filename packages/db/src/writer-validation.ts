import { z } from "zod";

export const WRITER_LINK_MAX = 5;
export const WRITER_SOURCE_MIN_CHARS = 100;
export const WRITER_SOURCE_MAX_CHARS = 32_000;
export const WRITER_LINK_LABEL_MAX = 80;

const httpsUrl = z
  .string()
  .trim()
  .min(1)
  .refine((s) => z.string().url().safeParse(s).success, { message: "Invalid URL" })
  .refine((s) => s.startsWith("https://"), { message: "URL must use https" });

export const writerLinkSchema = z.object({
  url: httpsUrl,
  label: z.string().trim().max(WRITER_LINK_LABEL_MAX).optional(),
});

export type WriterLink = z.infer<typeof writerLinkSchema>;

export const writerRewriteInputSchema = z.object({
  voice_id: z.string().uuid(),
  source_text: z
    .string()
    .trim()
    .min(WRITER_SOURCE_MIN_CHARS, `Article must be at least ${WRITER_SOURCE_MIN_CHARS} characters`)
    .max(WRITER_SOURCE_MAX_CHARS),
  links: z.array(writerLinkSchema).max(WRITER_LINK_MAX).default([]),
  writer_article_id: z.string().uuid().optional(),
});

export type WriterRewriteInput = z.infer<typeof writerRewriteInputSchema>;

export function parseWriterLinks(raw: unknown): WriterLink[] {
  if (!Array.isArray(raw)) return [];
  const out: WriterLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const url = String((item as { url?: unknown }).url ?? "").trim();
    if (!url) continue;
    const labelRaw = (item as { label?: unknown }).label;
    const label =
      labelRaw != null && String(labelRaw).trim() ? String(labelRaw).trim() : undefined;
    const parsed = writerLinkSchema.safeParse({ url, label });
    if (parsed.success) out.push(parsed.data);
    if (out.length >= WRITER_LINK_MAX) break;
  }
  return out;
}

/** Escape text for HTML text nodes and double-quoted attributes. */
function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** URL variants to match in generated HTML (trailing slash, encoded forms). */
function writerLinkUrlVariants(url: string): string[] {
  const trimmed = url.trim();
  const variants = new Set<string>([trimmed]);
  if (trimmed.endsWith("/")) {
    variants.add(trimmed.slice(0, -1));
  } else {
    variants.add(`${trimmed}/`);
  }
  try {
    const parsed = new URL(trimmed);
    variants.add(parsed.href);
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      const noSlash = new URL(trimmed);
      noSlash.pathname = parsed.pathname.replace(/\/$/, "");
      variants.add(noSlash.href);
    }
  } catch {
    // keep trimmed variants only
  }
  return [...variants];
}

export function writerLinkPresentInHtml(html: string, url: string): boolean {
  if (!url.trim()) return false;
  const haystack = html;
  for (const variant of writerLinkUrlVariants(url)) {
    if (haystack.includes(variant)) return true;
  }
  return false;
}

export function writerLinksMissingFromHtml(html: string, links: WriterLink[]): WriterLink[] {
  return links.filter((l) => !writerLinkPresentInHtml(html, l.url));
}

/** Split HTML fragment into `<p>...</p>` blocks for placement heuristics. */
export function writerHtmlParagraphs(html: string): string[] {
  const re = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  return html.match(re) ?? [];
}

/** Paragraph indices (0-based) where the URL appears inside a `<p>` block. */
export function writerLinkParagraphIndices(html: string, url: string): number[] {
  const paragraphs = writerHtmlParagraphs(html);
  const indices: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (writerLinkPresentInHtml(paragraphs[i] ?? "", url)) indices.push(i);
  }
  return indices;
}

const CLUSTER_END_PARAGRAPH_FRACTION = 0.6;

/**
 * True when multiple links all appear only near the end (shoehorned closing sentences).
 */
export function writerLinksClusteredAtEnd(html: string, links: WriterLink[]): boolean {
  if (links.length < 2) return false;
  const paragraphs = writerHtmlParagraphs(html);
  const pCount = paragraphs.length;
  if (pCount < 2) return false;

  const threshold = Math.ceil(pCount * CLUSTER_END_PARAGRAPH_FRACTION);
  const minIndices: number[] = [];

  for (const link of links) {
    const found = writerLinkParagraphIndices(html, link.url);
    if (!found.length) return false;
    minIndices.push(Math.min(...found));
  }

  if (minIndices.every((i) => i >= threshold)) return true;

  const lastSpan = Math.max(1, Math.ceil(pCount * (1 - CLUSTER_END_PARAGRAPH_FRACTION)));
  const startIdx = pCount - lastSpan;
  if (minIndices.every((i) => i >= startIdx)) return true;

  if (pCount >= 3 && new Set(minIndices).size === 1 && minIndices[0]! >= pCount - 2) {
    return true;
  }

  return false;
}

export function formatWriterLinksForPrompt(links: WriterLink[]): string {
  if (!links.length) return "(none — do not add external links)";
  const lines = links.map((l, i) => {
    const label = l.label?.trim();
    return `${i + 1}. URL: ${l.url}${label ? ` — suggested anchor: ${label}` : ""}`;
  });
  lines.push("Placement: distribute links across the article body, not clustered at the end.");
  return lines.join("\n");
}

function writerLinkAnchorText(link: WriterLink): string {
  const label = link.label?.trim();
  if (label) return label;
  try {
    return new URL(link.url).hostname.replace(/^www\./i, "");
  } catch {
    return link.url;
  }
}

/** Append a Related links block for any URLs missing from model output. */
export function ensureWriterLinksInHtml(html: string, links: WriterLink[]): string {
  const missing = writerLinksMissingFromHtml(html, links);
  if (!missing.length) return html;

  const items = missing
    .map((link) => {
      const href = escapeHtmlText(link.url);
      const text = escapeHtmlText(writerLinkAnchorText(link));
      return `<li><a href="${href}">${text}</a></li>`;
    })
    .join("\n");

  const block = `<h2>Related links</h2>\n<ul>\n${items}\n</ul>`;
  const trimmed = html.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

export function defaultWriterTitle(sourceText: string): string {
  const line = sourceText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "Untitled article";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}
