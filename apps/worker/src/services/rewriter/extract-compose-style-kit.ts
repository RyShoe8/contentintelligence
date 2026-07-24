import {
  composeStyleKitSchema,
  sanitizeArticleHtmlForLearning,
  stripHtmlToPlainText,
  writerHtmlParagraphs,
  type ComposeStyleKit,
} from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";
import { extractHeadingsFromExampleHtml } from "./compose-style-excerpt.js";
import { attachArchetypeToStyleKit } from "./compose-article-archetype.js";

const SIGNATURE_MAX_WORDS = 65;
const OPENING_PARAGRAPH_COUNT = 4;
const SIGNATURE_TARGET = 6;
const RHYTHM_SAMPLE_CHARS = 600;
const CONCRETE_DETAIL_TARGET = 15;
const CONCRETE_DETAIL_MAX_WORDS = 50;
const SHORT_PARAGRAPH_WORDS = 12;

function isListOnlyParagraph(html: string): boolean {
  const trimmed = html.trim();
  return /^<(ul|ol)\b/i.test(trimmed) || /^<li\b/i.test(trimmed);
}

function paragraphWordCount(html: string): number {
  return stripHtmlToPlainText(html).split(/\s+/).filter(Boolean).length;
}

/** Stance markers that are generic to opinionated writing, not to any one brand's subject. */
const STANCE_MARKER_RE =
  /\b(?:never|always|refuse|insist|believe|rule|principle|prefer|reject|avoid|require)\b/i;

function scoreSignatureParagraph(plain: string): number {
  let score = 0;
  // Any consistent narrating person, not specifically first-person plural.
  if (/\b(?:we|our|us|i|my|you|your)\b/i.test(plain)) score += 3;
  const words = plain.split(/\s+/).filter(Boolean).length;
  if (words >= 8 && words <= 45) score += 2;
  if (words <= SIGNATURE_MAX_WORDS) score += 1;
  if (STANCE_MARKER_RE.test(plain)) score += 1;
  return score;
}

function midArticleRhythmSample(sanitized: string): string | undefined {
  const plain = stripHtmlToPlainText(sanitized);
  if (plain.length < 400) return undefined;
  const midStart = Math.floor(plain.length * 0.35);
  const sample = plain.slice(midStart, midStart + RHYTHM_SAMPLE_CHARS).trim();
  return sample.length >= 80 ? sample : undefined;
}

// Numbers, percentages, dimensions, warranties, money, and Name Surname pairs.
const CONCRETE_SIGNAL_RES = [
  /\d+(?:\.\d+)?%/,
  /\d{1,3}(?:,\d{3})+/,
  /\d+\s*[-–]?\s*(?:year|years|sq\.?\s*ft|square\s+(?:feet|foot)|ft|foot|inch|inches)\b/i,
  /\$\d/,
  /\b\d+['′]\s?\d+["″]?/,
  /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/,
];

function sentenceConcreteScore(sentence: string): number {
  let score = 0;
  for (const re of CONCRETE_SIGNAL_RES) {
    if (re.test(sentence)) score += 2;
  }
  if (/\b(?:we|our|us|i|my)\b/i.test(sentence)) score += 1;
  return score;
}

function splitIntoSentences(plain: string): string[] {
  return plain
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
}

/** Verbatim brand-specific facts (numbers, names, places, processes) from example copy. */
export function extractConcreteDetails(sanitized: string): string[] {
  const sentences = splitIntoSentences(stripHtmlToPlainText(sanitized));
  const scored = sentences
    .map((sentence) => ({ sentence, score: sentenceConcreteScore(sentence) }))
    .filter(({ sentence, score }) => {
      if (score < 2) return false;
      const words = sentence.split(/\s+/).filter(Boolean).length;
      return words >= 4 && words <= CONCRETE_DETAIL_MAX_WORDS;
    })
    .sort((a, b) => b.score - a.score)
    .map(({ sentence }) => sentence);
  return [...new Set(scored)].slice(0, CONCRETE_DETAIL_TARGET);
}

function paragraphHasFragmentRun(plain: string): boolean {
  const sentences = plain.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return sentences.some((s) => {
    const words = s.split(/\s+/).filter(Boolean).length;
    return words >= 1 && words <= 4 && /[.!?]$/.test(s);
  });
}

/** Paragraph rhythm metrics from example copy. */
export function extractRhythmMetrics(sanitized: string): {
  shortParagraphShare: number;
  hasFragments: boolean;
  hasBoldLines: boolean;
} {
  const paragraphs = writerHtmlParagraphs(sanitized)
    .filter((p) => !isListOnlyParagraph(p))
    .map((p) => stripHtmlToPlainText(p).trim())
    .filter((t) => t.length > 0);

  const shortCount = paragraphs.filter(
    (t) => t.split(/\s+/).filter(Boolean).length <= SHORT_PARAGRAPH_WORDS,
  ).length;
  const shortParagraphShare = paragraphs.length ? shortCount / paragraphs.length : 0;
  const hasFragments = paragraphs.some(paragraphHasFragmentRun);

  const bodyWithoutHeadings = sanitized.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, "");
  const hasBoldLines = /<(?:strong|b)\b/i.test(bodyWithoutHeadings);

  return { shortParagraphShare, hasFragments, hasBoldLines };
}

/** Deterministic style kit from HTML — no LLM. */
export function extractComposeStyleKitDeterministic(html: string): ComposeStyleKit {
  const sanitized = sanitizeArticleHtmlForLearning(html);
  const headings = extractHeadingsFromExampleHtml(sanitized);

  const paragraphBlocks = writerHtmlParagraphs(sanitized).filter(
    (p) => !isListOnlyParagraph(p) && paragraphWordCount(p) >= 6,
  );

  const openingParagraphs = paragraphBlocks
    .slice(0, OPENING_PARAGRAPH_COUNT)
    .map((p) => stripHtmlToPlainText(p).trim())
    .filter((t) => t.length >= 20);

  const signatureCandidates = paragraphBlocks
    .map((p) => stripHtmlToPlainText(p).trim())
    .filter((plain) => {
      const words = plain.split(/\s+/).filter(Boolean).length;
      return words >= 8 && words <= SIGNATURE_MAX_WORDS && !/^[-•*]\s/.test(plain);
    })
    .sort((a, b) => scoreSignatureParagraph(b) - scoreSignatureParagraph(a));

  const signatureParagraphs = [...new Set(signatureCandidates)].slice(0, SIGNATURE_TARGET);
  const rhythmSample = midArticleRhythmSample(sanitized);
  const concreteDetails = extractConcreteDetails(sanitized);
  const rhythm = extractRhythmMetrics(sanitized);

  const kitInput: Record<string, unknown> = {
    headings,
    openingParagraphs,
    signatureParagraphs,
    concreteDetails,
    rhythm,
  };
  if (rhythmSample) kitInput.rhythmSample = rhythmSample;

  return attachArchetypeToStyleKit(
    composeStyleKitSchema.parse(kitInput),
    sanitized,
  );
}

async function extractKitFieldsWithLlm(html: string): Promise<{
  signatureParagraphs: string[];
  concreteDetails: string[];
}> {
  const trimmed = sanitizeArticleHtmlForLearning(html).slice(0, 12000);
  if (!trimmed.trim()) return { signatureParagraphs: [], concreteDetails: [] };

  const raw = await completeJson<{
    signatureParagraphs?: string[];
    concreteDetails?: string[];
  }>({
    system: `Extract brand voice anchors from editorial content as JSON only:
{"signatureParagraphs": string[], "concreteDetails": string[]}
Rules:
- signatureParagraphs: 2–3 short paragraphs (1–3 sentences) that best show this brand's voice. Prefer clear opinions, rules, or stances over neutral overview. Keep whatever grammatical person the brand uses.
- concreteDetails: up to 8 verbatim brand-specific facts — numbers, percentages, named people, named tests or processes, places, warranties, dimensions. One sentence each.
- Copy text verbatim from the article; do not invent.
- Empty arrays if none found.`,
    user: trimmed,
    temperature: 0.2,
    maxTokens: 900,
  });

  const signatureParagraphs =
    raw?.signatureParagraphs
      ?.filter((p) => typeof p === "string" && p.trim().length >= 20)
      .slice(0, 3)
      .map((p) => p.trim()) ?? [];
  const concreteDetails =
    raw?.concreteDetails
      ?.filter((d) => typeof d === "string" && d.trim().length >= 10)
      .slice(0, 8)
      .map((d) => d.trim()) ?? [];
  return { signatureParagraphs, concreteDetails };
}

/** Full kit extraction: deterministic + optional LLM when signatures or details are sparse. */
export async function extractComposeStyleKit(html: string): Promise<ComposeStyleKit> {
  const kit = extractComposeStyleKitDeterministic(html);
  if (kit.signatureParagraphs.length >= 2 && kit.concreteDetails.length >= 3) return kit;

  try {
    const llm = await extractKitFieldsWithLlm(html);
    if (!llm.signatureParagraphs.length && !llm.concreteDetails.length) return kit;
    return composeStyleKitSchema.parse({
      ...kit,
      signatureParagraphs: [
        ...new Set([...kit.signatureParagraphs, ...llm.signatureParagraphs]),
      ].slice(0, SIGNATURE_TARGET),
      concreteDetails: [...new Set([...kit.concreteDetails, ...llm.concreteDetails])].slice(
        0,
        CONCRETE_DETAIL_TARGET,
      ),
    });
  } catch {
    return kit;
  }
}

/** Compact summary for voice-brief preprocessing prompts. */
export function summarizeComposeStyleKits(kits: ComposeStyleKit[]): string | undefined {
  if (!kits.length) return undefined;
  const blocks = kits.map((kit, i) => {
    const headingLine =
      kit.headings.length > 0
        ? `Headings: ${kit.headings.slice(0, 6).join("; ")}`
        : "";
    const signatureLine =
      kit.signatureParagraphs[0] != null
        ? `Signature: ${kit.signatureParagraphs[0]}`
        : kit.openingParagraphs[0] != null
          ? `Opening: ${kit.openingParagraphs[0]}`
          : "";
    return [`Example ${i + 1}`, headingLine, signatureLine].filter(Boolean).join("\n");
  });
  return blocks.join("\n\n");
}
