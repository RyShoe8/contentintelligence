import { z } from "zod";

export const WRITER_LINK_MAX = 5;
export const WRITER_REFERENCE_URL_MAX = 15;
export const WRITER_SOURCE_MIN_CHARS = 100;
export const WRITER_SOURCE_MAX_CHARS = 32_000;
export const WRITER_TOPIC_MIN_CHARS = 10;
export const WRITER_TOPIC_MAX_CHARS = 500;
export const WRITER_LINK_LABEL_MAX = 80;
export const WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT = 3;
export const WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT = 5;
export const WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT = 10;
export const WRITER_WEB_SEARCH_MAX_RESULTS_LIMIT = 15;
export const WRITER_ARTICLE_DEPTH_DEFAULT = 50;
export const WRITER_SUBTOPIC_MAX = 8;
export const WRITER_SUBTOPIC_MIN_CHARS = 3;
export const WRITER_SUBTOPIC_MAX_CHARS = 200;

export type WriterArticleDepthGuidance = {
  label: string;
  minWords: number;
  maxWords: number;
  researchBriefMinWords: number;
  researchBriefMaxWords: number;
  reconstructionPrompt: string;
  researchBriefPrompt: string;
};

export function writerArticleDepthGuidance(depth: number): WriterArticleDepthGuidance {
  const d = Math.min(100, Math.max(0, Math.round(depth)));
  if (d <= 25) {
    return {
      label: "Overview",
      minWords: 700,
      maxWords: 1000,
      researchBriefMinWords: 400,
      researchBriefMaxWords: 800,
      researchBriefPrompt: "roughly 400–800 words of briefing content",
      reconstructionPrompt:
        "Write a concise overview article of about 700–1,000 words. Use 3–4 H2 sections. Cover essentials without filler.",
    };
  }
  if (d <= 50) {
    return {
      label: "Standard",
      minWords: 1200,
      maxWords: 1800,
      researchBriefMinWords: 800,
      researchBriefMaxWords: 1200,
      researchBriefPrompt: "roughly 800–1,200 words of briefing content",
      reconstructionPrompt:
        "Write a standard-length article of about 1,200–1,800 words. Use 4–6 H2 sections with substantive paragraphs under each.",
    };
  }
  if (d <= 75) {
    return {
      label: "In-depth",
      minWords: 2000,
      maxWords: 2800,
      researchBriefMinWords: 1200,
      researchBriefMaxWords: 1800,
      researchBriefPrompt: "roughly 1,200–1,800 words of briefing content",
      reconstructionPrompt:
        "Write an in-depth article of about 2,000–2,800 words. Use 5–8 H2 sections. Expand key points with examples, nuance, and practical detail.",
    };
  }
  return {
    label: "Comprehensive",
    minWords: 3000,
    maxWords: 4500,
    researchBriefMinWords: 1800,
    researchBriefMaxWords: 2500,
    researchBriefPrompt: "roughly 1,800–2,500 words of briefing content",
    reconstructionPrompt:
      "Write a comprehensive, highly informative article of about 3,000–4,500 words. Use 6–10 H2 sections. Thoroughly develop each theme with evidence, examples, caveats, and actionable detail.",
  };
}

export function writerArticleDepthLabel(depth: number): string {
  return writerArticleDepthGuidance(depth).label;
}

export function writerComposeFaqCountGuidance(depth: number): { min: number; max: number } {
  const d = Math.min(100, Math.max(0, Math.round(depth)));
  if (d <= 25) return { min: 3, max: 4 };
  if (d <= 50) return { min: 4, max: 6 };
  if (d <= 75) return { min: 5, max: 7 };
  return { min: 6, max: 8 };
}

export type WriterComposeResearchConfig = {
  maxResearchQuestions: number;
  sectionBatchSize: number;
  minCitationsPerSection: number;
  maxSearchQueries: number;
  gapFillPass: boolean;
};

export function writerComposeResearchConfig(articleDepth: number): WriterComposeResearchConfig {
  const d = Math.min(100, Math.max(0, Math.round(articleDepth)));
  if (d <= 25) {
    return {
      maxResearchQuestions: 6,
      sectionBatchSize: 2,
      minCitationsPerSection: 1,
      maxSearchQueries: 3,
      gapFillPass: false,
    };
  }
  if (d <= 50) {
    return {
      maxResearchQuestions: 8,
      sectionBatchSize: 2,
      minCitationsPerSection: 2,
      maxSearchQueries: 4,
      gapFillPass: false,
    };
  }
  if (d <= 75) {
    return {
      maxResearchQuestions: 10,
      sectionBatchSize: 1,
      minCitationsPerSection: 2,
      maxSearchQueries: 5,
      gapFillPass: false,
    };
  }
  return {
    maxResearchQuestions: 12,
    sectionBatchSize: 1,
    minCitationsPerSection: 3,
    maxSearchQueries: 5,
    gapFillPass: true,
  };
}

const COMPOSE_TOPIC_DRIFT_META_PHRASES = [
  "creating engaging content",
  "fostering community",
  "community engagement",
  "content strategy",
  "encouraging community",
  "promoting the brand",
  "our community",
  "the community",
] as const;

function countTermMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

/** Deterministic flags when compose article centers brand/community over the topic. */
export function writerComposeTopicDriftIssues(
  html: string,
  topic: string,
  brandName?: string,
): string[] {
  const plain = stripHtmlToPlainText(html).toLowerCase();
  const issues: string[] = [];
  const topicWords = topic
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const topicHits = topicWords.reduce(
    (sum, word) => sum + countTermMatches(plain, new RegExp(`\\b${word}\\b`, "g")),
    0,
  );

  const brand = brandName?.trim();
  const brandHits = brand
    ? countTermMatches(plain, new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"))
    : 0;

  for (const phrase of COMPOSE_TOPIC_DRIFT_META_PHRASES) {
    if (plain.includes(phrase)) {
      issues.push(`Article contains meta/community framing ("${phrase}") instead of topic coverage`);
    }
  }

  if (brand && brandHits >= 3 && brandHits > topicHits / 2) {
    issues.push(
      `Article mentions "${brand}" too often relative to the topic — keep the brand as voice, not the subject`,
    );
  }

  const communityHits = countTermMatches(plain, /\bcommunity\b/g);
  if (communityHits >= 3 && communityHits > Math.max(2, topicHits / 4)) {
    issues.push("Article focuses on community rather than the topic");
  }

  return [...new Set(issues)].slice(0, 6);
}

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
  rewrite_divergence_min: z.coerce.number().int().min(0).max(100).default(0),
  preserve_instructions: z.boolean().default(false),
});

export type WriterRewriteInput = z.infer<typeof writerRewriteInputSchema>;

export const writerComposeInputSchema = z.object({
  voice_id: z.string().uuid(),
  topic: z
    .string()
    .trim()
    .min(WRITER_TOPIC_MIN_CHARS, `Topic must be at least ${WRITER_TOPIC_MIN_CHARS} characters`)
    .max(WRITER_TOPIC_MAX_CHARS),
  reference_urls: z.array(httpsUrl).max(WRITER_REFERENCE_URL_MAX).default([]),
  links: z.array(writerLinkSchema).max(WRITER_LINK_MAX).default([]),
  writer_article_id: z.string().uuid().optional(),
  deep_research: z.boolean().default(true),
  web_search: z.boolean().default(true),
  web_search_max_queries: z.coerce
    .number()
    .int()
    .min(1)
    .max(WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT)
    .default(WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT),
  web_search_max_results: z.coerce
    .number()
    .int()
    .min(1)
    .max(WRITER_WEB_SEARCH_MAX_RESULTS_LIMIT)
    .default(WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT),
  article_depth: z.coerce.number().int().min(0).max(100).default(WRITER_ARTICLE_DEPTH_DEFAULT),
  subtopics: z
    .array(z.string().trim().min(WRITER_SUBTOPIC_MIN_CHARS).max(WRITER_SUBTOPIC_MAX_CHARS))
    .max(WRITER_SUBTOPIC_MAX)
    .default([]),
  include_faq: z.boolean().default(false),
});

export type WriterComposeInput = z.infer<typeof writerComposeInputSchema>;

export function parseWriterReferenceUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const url = typeof item === "string" ? item.trim() : String(item ?? "").trim();
    if (!url) continue;
    const parsed = httpsUrl.safeParse(url);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= WRITER_REFERENCE_URL_MAX) break;
  }
  return out;
}

export function parseWriterSubtopics(raw: unknown): string[] {
  const lines = Array.isArray(raw)
    ? raw.map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    : typeof raw === "string"
      ? raw.split(/\r?\n/).map((l) => l.trim())
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.length < WRITER_SUBTOPIC_MIN_CHARS) continue;
    const clipped = line.slice(0, WRITER_SUBTOPIC_MAX_CHARS);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= WRITER_SUBTOPIC_MAX) break;
  }
  return out;
}

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

/** All href values from `<a>` tags in HTML. */
export function writerAnchorHrefsInHtml(html: string): string[] {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const hrefs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]?.trim();
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function hrefMatchesWriterUrl(href: string, url: string): boolean {
  const hrefVariants = new Set(writerLinkUrlVariants(href));
  for (const variant of writerLinkUrlVariants(url)) {
    if (hrefVariants.has(variant)) return true;
  }
  return false;
}

export function writerLinkPresentInHtml(html: string, url: string): boolean {
  if (!url.trim()) return false;
  return writerAnchorHrefsInHtml(html).some((href) => hrefMatchesWriterUrl(href, url));
}

export function writerLinksPresentCount(html: string, links: WriterLink[]): number {
  return links.filter((l) => writerLinkPresentInHtml(html, l.url)).length;
}

const SOURCE_HTTPS_URL_RE = /https:\/\/[^\s<>"')\]]+/gi;

/** Extract https URLs from plain text and any anchor hrefs in pasted source. */
export function writerUrlsInSourceText(sourceText: string): string[] {
  const urls = new Set<string>();
  for (const href of writerAnchorHrefsInHtml(sourceText)) {
    if (href.startsWith("https://")) urls.add(href);
  }
  const re = new RegExp(SOURCE_HTTPS_URL_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(sourceText)) !== null) {
    const raw = m[0]?.replace(/[.,;:!?)]+$/, "");
    if (raw?.startsWith("https://")) urls.add(raw);
  }
  return [...urls];
}

export function writerUrlInSourceText(sourceText: string, url: string): boolean {
  if (!url.trim()) return false;
  return writerUrlsInSourceText(sourceText).some((src) => hrefMatchesWriterUrl(src, url));
}

/** Count anchor hrefs in rewrite that match none of the requested URLs. */
export function writerNonRequestedLinksInHtml(html: string, links: WriterLink[]): number {
  let count = 0;
  for (const href of writerAnchorHrefsInHtml(html)) {
    if (!href.startsWith("https://")) continue;
    if (!links.some((l) => hrefMatchesWriterUrl(href, l.url))) count++;
  }
  return count;
}

/** Requested URLs that were already in source and appear as anchors in output. */
export function writerRequestedLinksCarriedFromSource(
  sourceText: string,
  html: string,
  links: WriterLink[],
): number {
  return links.filter(
    (l) => writerUrlInSourceText(sourceText, l.url) && writerLinkPresentInHtml(html, l.url),
  ).length;
}

/** Requested URLs present in output that were not already in source. */
export function writerRequestedLinksAdded(
  sourceText: string,
  html: string,
  links: WriterLink[],
): number {
  const present = writerLinksPresentCount(html, links);
  const carried = writerRequestedLinksCarriedFromSource(sourceText, html, links);
  return Math.max(0, present - carried);
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

const SPREAD_END_PARAGRAPH_FRACTION = 0.25;
const SPREAD_MEAN_POSITION_FRACTION = 0.65;

/** True when requested links are too concentrated toward the end of the article body. */
export function writerLinksNeedSpread(html: string, links: WriterLink[]): boolean {
  if (!links.length) return false;
  if (writerLinksMissingFromHtml(html, links).length > 0) return false;

  if (writerLinksClusteredAtEnd(html, links)) return true;

  const paragraphs = writerHtmlParagraphs(html);
  const pCount = paragraphs.length;
  if (pCount < 2) return false;

  const indices: number[] = [];
  for (const link of links) {
    const found = writerLinkParagraphIndices(html, link.url);
    if (!found.length) return false;
    indices.push(Math.min(...found));
  }

  if (links.length === 1 && pCount >= 3) {
    const idx = indices[0]!;
    const lastQuarterStart = Math.ceil(pCount * (1 - SPREAD_END_PARAGRAPH_FRACTION));
    if (idx === pCount - 1 || idx >= lastQuarterStart) return true;
  }

  if (links.length >= 2 && pCount >= 4 && new Set(indices).size === 1) return true;

  if (links.length >= 2 && pCount >= 2) {
    const mean = indices.reduce((a, b) => a + b, 0) / indices.length;
    if (mean > SPREAD_MEAN_POSITION_FRACTION * (pCount - 1)) return true;
  }

  return false;
}

/**
 * True when a link sits in a short promotional sentence or link-only micro-paragraph.
 */
export function writerLinksShallowOrFabricated(
  sourceText: string,
  html: string,
  links: WriterLink[],
): boolean {
  const paragraphs = writerHtmlParagraphs(html);
  const sourceNorm = sourceText.trim();

  for (const link of links) {
    if (!writerLinkPresentInHtml(html, link.url)) continue;

    const pIdx = writerLinkParagraphForUrl(html, link.url);
    if (pIdx == null) continue;

    const paragraph = paragraphs[pIdx] ?? "";
    const plain = stripHtmlToPlainText(paragraph);
    const wordCount = countWords(plain);
    const anchor = writerLinkAnchorText(link);
    const anchorWords = anchorWordsInParagraph(paragraph, link.url);
    const labelInSource = normalizedContains(sourceNorm, anchor);

    if (
      !labelInSource &&
      wordCount <= FABRICATED_LINK_PARAGRAPH_MAX_WORDS &&
      normalizedContains(plain, anchor)
    ) {
      return true;
    }

    if (
      wordCount <= SHALLOW_LINK_PARAGRAPH_MAX_WORDS &&
      anchorWords > 0 &&
      anchorWords / wordCount >= SHALLOW_ANCHOR_WORD_FRACTION
    ) {
      return true;
    }
  }

  return false;
}

export function writerLinksNeedRevision(
  html: string,
  links: WriterLink[],
  sourceText: string,
): boolean {
  if (!links.length) return false;
  if (writerLinksMissingFromHtml(html, links).length > 0) return true;
  if (writerLinksClusteredAtEnd(html, links)) return true;
  if (writerLinksShallowOrFabricated(sourceText, html, links)) return true;
  return false;
}

export function formatWriterLinksForPrompt(
  links: WriterLink[],
  opts?: { exactAnchorLabels?: boolean },
): string {
  if (!links.length) return "(none — do not add external links)";
  const placementHints = [
    "early body (first ~third)",
    "middle body",
    "later body (not closing paragraph)",
    "upper-middle body",
    "lower-middle body",
  ];
  const lines = links.map((l, i) => {
    const label = l.label?.trim();
    const anchorPart = label
      ? opts?.exactAnchorLabels
        ? ` — required anchor text (use exactly): ${label}`
        : ` — suggested anchor: ${label}`
      : "";
    const placement =
      links.length >= 2 ? ` — place in ${placementHints[i % placementHints.length]}` : "";
    return `${i + 1}. URL: ${l.url}${anchorPart}${placement}`;
  });
  lines.push("Placement: distribute links across the article body, not clustered at the end.");
  if (opts?.exactAnchorLabels && links.some((l) => l.label?.trim())) {
    lines.push(
      "When required anchor text is listed, use that exact phrase as the link text inside the anchor tag.",
    );
  }
  return lines.join("\n");
}

/** Strip HTML to plain text for comparison heuristics. */
export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

const DIVERGENCE_MIN_WORD_LEN = 2;
const DIVERGENCE_NGRAM_SIZE = 4;
const DIVERGENCE_SHORT_SOURCE_MAX_WORDS = 400;

function tokenizeForDivergence(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= DIVERGENCE_MIN_WORD_LEN);
  return new Set(tokens);
}

function ngramsForDivergence(text: string, n: number): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const grams = new Set<string>();
  if (tokens.length < n) {
    if (tokens.length) grams.add(tokens.join(" "));
    return grams;
  }
  for (let i = 0; i <= tokens.length - n; i++) {
    grams.add(tokens.slice(i, i + n).join(" "));
  }
  return grams;
}

function jaccardDivergenceScore(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  if (!a.size || !b.size) return 100;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return Math.round(100 * (1 - intersection / union));
}

/**
 * 0 = nearly identical wording, 100 = very different (max of word + n-gram Jaccard distance).
 */
export function writerRewriteDivergenceScore(sourceText: string, rewriteHtml: string): number {
  const sourcePlain = sourceText.trim();
  const rewritePlain = stripHtmlToPlainText(rewriteHtml);
  const wordScore = jaccardDivergenceScore(
    tokenizeForDivergence(sourcePlain),
    tokenizeForDivergence(rewritePlain),
  );
  const phrase4Score = jaccardDivergenceScore(
    ngramsForDivergence(sourcePlain, DIVERGENCE_NGRAM_SIZE),
    ngramsForDivergence(rewritePlain, DIVERGENCE_NGRAM_SIZE),
  );
  const scores = [wordScore, phrase4Score];
  if (countWords(stripHtmlToPlainText(sourcePlain)) < DIVERGENCE_SHORT_SOURCE_MAX_WORDS) {
    scores.push(
      jaccardDivergenceScore(
        ngramsForDivergence(sourcePlain, 3),
        ngramsForDivergence(rewritePlain, 3),
      ),
    );
  }
  return Math.max(...scores);
}

export function writerLinkParagraphForUrl(html: string, url: string): number | null {
  const indices = writerLinkParagraphIndices(html, url);
  return indices.length ? Math.min(...indices) : null;
}

const FABRICATED_LINK_PARAGRAPH_MAX_WORDS = 25;
const SHALLOW_LINK_PARAGRAPH_MAX_WORDS = 12;
const SHALLOW_ANCHOR_WORD_FRACTION = 0.35;

function countWords(text: string): number {
  const plain = text.trim();
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

function normalizedContains(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.trim().toLowerCase();
  return n.length > 0 && h.includes(n);
}

function anchorWordsInParagraph(paragraphHtml: string, url: string): number {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraphHtml)) !== null) {
    const href = m[1]?.trim();
    if (href && hrefMatchesWriterUrl(href, url)) {
      return countWords(stripHtmlToPlainText(m[2] ?? ""));
    }
  }
  return 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WEAVE_PARAGRAPH_FRACTIONS = [0.25, 0.5, 0.75, 0.33, 0.66];
const REDISTRIBUTE_END_CAP_FRACTION = 0.15;

function writerLinkSpreadTargetIndex(linkIndex: number, linkCount: number, pCount: number): number {
  const maxTarget = Math.max(0, pCount - Math.ceil(pCount * REDISTRIBUTE_END_CAP_FRACTION) - 1);
  if (linkCount <= 1) {
    return Math.min(maxTarget, Math.max(0, Math.floor(maxTarget / 2)));
  }
  const slot = Math.round((linkIndex * maxTarget) / Math.max(1, linkCount - 1));
  return Math.min(maxTarget, Math.max(0, slot));
}

function extractWriterLinkAnchorFromParagraph(
  paragraph: string,
  url: string,
): { anchorHtml: string; anchorText: string } | null {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraph)) !== null) {
    const href = m[1]?.trim();
    if (href && hrefMatchesWriterUrl(href, url)) {
      return {
        anchorHtml: m[0] ?? "",
        anchorText: stripHtmlToPlainText(m[2] ?? ""),
      };
    }
  }
  return null;
}

function linkParagraphIndexInArray(paragraphs: string[], url: string): number | null {
  for (let i = 0; i < paragraphs.length; i++) {
    if (writerLinkPresentInHtml(paragraphs[i] ?? "", url)) return i;
  }
  return null;
}

function insertWriterLinkIntoParagraph(
  paragraph: string,
  link: WriterLink,
  preferredAnchorText?: string,
): string {
  if (writerLinkPresentInHtml(paragraph, link.url)) return paragraph;

  const href = escapeHtmlText(link.url);
  const anchor = preferredAnchorText?.trim() || writerLinkAnchorText(link);
  const anchorEsc = escapeHtmlText(anchor);
  const plain = stripHtmlToPlainText(paragraph);

  if (normalizedContains(plain, anchor)) {
    const anchorRe = new RegExp(escapeRegex(anchor), "i");
    return paragraph.replace(anchorRe, `<a href="${href}">${anchorEsc}</a>`);
  }

  const periodSplit = paragraph.match(/^(<p\b[^>]*>[\s\S]*?)(\.\s+)([\s\S]*?<\/p>)$/i);
  if (periodSplit) {
    return `${periodSplit[1]} (<a href="${href}">${anchorEsc}</a>).${periodSplit[2]!.slice(1)}${periodSplit[3]}`;
  }

  return paragraph.replace(/<\/p>\s*$/i, ` (<a href="${href}">${anchorEsc}</a>).</p>`);
}

/**
 * Move existing anchors from late paragraphs into evenly spaced body slots.
 */
export function redistributeWriterLinksInBody(
  html: string,
  links: WriterLink[],
): { html: string; redistributed: number } {
  if (!links.length) return { html, redistributed: 0 };

  const paragraphRe = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  const matches = [...html.matchAll(paragraphRe)];
  const paragraphs = matches.map((m) => m[0]);
  const pCount = paragraphs.length;
  if (pCount < 2) return { html, redistributed: 0 };

  let redistributed = 0;

  for (let i = 0; i < links.length; i++) {
    const link = links[i]!;
    const targetIdx = writerLinkSpreadTargetIndex(i, links.length, pCount);
    const currentIdx = linkParagraphIndexInArray(paragraphs, link.url);
    if (currentIdx == null) continue;
    if (Math.abs(currentIdx - targetIdx) <= 1) continue;

    const extracted = extractWriterLinkAnchorFromParagraph(paragraphs[currentIdx] ?? "", link.url);
    if (!extracted) continue;

    let sourceParagraph = paragraphs[currentIdx] ?? "";
    sourceParagraph = sourceParagraph.replace(extracted.anchorHtml, extracted.anchorText);
    sourceParagraph = sourceParagraph.replace(/\s{2,}/g, " ");
    paragraphs[currentIdx] = sourceParagraph;

    if (currentIdx !== targetIdx) {
      paragraphs[targetIdx] = insertWriterLinkIntoParagraph(
        paragraphs[targetIdx] ?? "",
        link,
        extracted.anchorText,
      );
      redistributed++;
    }
  }

  let result = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const original = matches[i]![0];
    const updated = paragraphs[i]!;
    if (original !== updated) {
      const start = matches[i]!.index!;
      result = result.slice(0, start) + updated + result.slice(start + original.length);
    }
  }

  return { html: result, redistributed };
}

/**
 * Deterministically weave missing links into body paragraphs as inline anchors.
 */
export function weaveMissingWriterLinksInBody(
  html: string,
  missingLinks: WriterLink[],
): { html: string; woven: number } {
  if (!missingLinks.length) return { html, woven: 0 };

  const paragraphRe = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  const matches = [...html.matchAll(paragraphRe)];
  const paragraphs = matches.map((m) => m[0]);
  if (!paragraphs.length) return { html, woven: 0 };

  let woven = 0;
  for (let i = 0; i < missingLinks.length; i++) {
    const link = missingLinks[i]!;
    const frac = WEAVE_PARAGRAPH_FRACTIONS[i % WEAVE_PARAGRAPH_FRACTIONS.length]!;
    const pIdx = Math.min(
      paragraphs.length - 1,
      Math.max(0, Math.floor(paragraphs.length * frac)),
    );
    const paragraph = paragraphs[pIdx] ?? "";
    const href = escapeHtmlText(link.url);
    const anchor = writerLinkAnchorText(link);
    const anchorEsc = escapeHtmlText(anchor);
    let updated = paragraph;

    const plain = stripHtmlToPlainText(paragraph);
    if (normalizedContains(plain, anchor) && !writerLinkPresentInHtml(paragraph, link.url)) {
      const anchorRe = new RegExp(escapeRegex(anchor), "i");
      updated = paragraph.replace(anchorRe, `<a href="${href}">${anchorEsc}</a>`);
    }
    if (updated === paragraph) {
      updated = paragraph.replace(/<\/p>\s*$/i, ` See <a href="${href}">${anchorEsc}</a>.</p>`);
    }
    paragraphs[pIdx] = updated;
    woven++;
  }

  let result = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const original = matches[i]![0];
    const updated = paragraphs[i]!;
    if (original !== updated) {
      const start = matches[i]!.index!;
      result = result.slice(0, start) + updated + result.slice(start + original.length);
    }
  }
  return { html: result, woven };
}

/** Weave missing links into body; redistribute end-heavy links; append Related links when needed. */
export function finalizeWriterLinksInHtml(
  html: string,
  links: WriterLink[],
): { html: string; linksWoven: number; linksAppended: number; linksRedistributed: number } {
  let out = html;
  let missing = writerLinksMissingFromHtml(out, links);
  let linksWoven = 0;
  if (missing.length) {
    const woven = weaveMissingWriterLinksInBody(out, missing);
    out = woven.html;
    linksWoven = woven.woven;
    missing = writerLinksMissingFromHtml(out, links);
  }

  let linksRedistributed = 0;
  if (writerLinksNeedSpread(out, links)) {
    const redistributed = redistributeWriterLinksInBody(out, links);
    out = redistributed.html;
    linksRedistributed = redistributed.redistributed;
    missing = writerLinksMissingFromHtml(out, links);
    if (missing.length) {
      const reWoven = weaveMissingWriterLinksInBody(out, missing);
      out = reWoven.html;
      linksWoven += reWoven.woven;
      missing = writerLinksMissingFromHtml(out, links);
    }
  }

  let linksAppended = 0;
  if (missing.length) {
    const before = out;
    out = ensureWriterLinksInHtml(out, missing);
    if (out !== before) linksAppended = missing.length;
  }
  out = enforceWriterLinkAnchorLabels(out, links);
  return { html: out, linksWoven, linksAppended, linksRedistributed };
}

export function writerLinkAnchorMatches(html: string, link: WriterLink): boolean {
  const label = link.label?.trim();
  if (!label) return true;
  if (!writerLinkPresentInHtml(html, link.url)) return false;

  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const want = label.toLowerCase();
  while ((m = re.exec(html)) !== null) {
    const href = m[1]?.trim();
    if (!href || !hrefMatchesWriterUrl(href, link.url)) continue;
    const inner = stripHtmlToPlainText(m[2] ?? "").trim().toLowerCase();
    if (inner === want) return true;
  }
  return false;
}

/** Replace anchor inner text with user-provided labels for matching URLs. */
export function enforceWriterLinkAnchorLabels(html: string, links: WriterLink[]): string {
  let out = html;
  for (const link of links) {
    const label = link.label?.trim();
    if (!label) continue;

    const re = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*?)>([\s\S]*?)<\/a>/gi;
    out = out.replace(re, (full, pre, href, post, _inner) => {
      if (!hrefMatchesWriterUrl(String(href).trim(), link.url)) return full;
      const hrefEsc = escapeHtmlText(String(href).trim());
      const labelEsc = escapeHtmlText(label);
      return `<a${pre}href="${hrefEsc}"${post}>${labelEsc}</a>`;
    });
  }
  return out;
}

export function writerLinkAnchorText(link: WriterLink): string {
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

export function defaultComposeTitle(topic: string): string {
  const trimmed = topic.trim();
  if (!trimmed) return "Untitled article";
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}
