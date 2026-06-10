import {
  composeStyleKitSchema,
  sanitizeArticleHtmlForLearning,
  stripHtmlToPlainText,
  writerHtmlParagraphs,
  type ComposeStyleKit,
} from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";
import { extractHeadingsFromExampleHtml } from "./compose-style-excerpt.js";

const SIGNATURE_MAX_WORDS = 65;
const OPENING_PARAGRAPH_COUNT = 4;
const SIGNATURE_TARGET = 6;
const RHYTHM_SAMPLE_CHARS = 600;

function isListOnlyParagraph(html: string): boolean {
  const trimmed = html.trim();
  return /^<(ul|ol)\b/i.test(trimmed) || /^<li\b/i.test(trimmed);
}

function paragraphWordCount(html: string): number {
  return stripHtmlToPlainText(html).split(/\s+/).filter(Boolean).length;
}

function scoreSignatureParagraph(plain: string): number {
  let score = 0;
  if (/\b(?:we|our|us)\b/i.test(plain)) score += 3;
  const words = plain.split(/\s+/).filter(Boolean).length;
  if (words >= 8 && words <= 45) score += 2;
  if (words <= SIGNATURE_MAX_WORDS) score += 1;
  if (/never|always|believe|rule|test|selective|partner/i.test(plain)) score += 1;
  return score;
}

function midArticleRhythmSample(sanitized: string): string | undefined {
  const plain = stripHtmlToPlainText(sanitized);
  if (plain.length < 400) return undefined;
  const midStart = Math.floor(plain.length * 0.35);
  const sample = plain.slice(midStart, midStart + RHYTHM_SAMPLE_CHARS).trim();
  return sample.length >= 80 ? sample : undefined;
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

  return composeStyleKitSchema.parse({
    headings,
    openingParagraphs,
    signatureParagraphs,
    rhythmSample,
  });
}

async function extractSignatureParagraphsWithLlm(html: string): Promise<string[]> {
  const trimmed = sanitizeArticleHtmlForLearning(html).slice(0, 12000);
  if (!trimmed.trim()) return [];

  const raw = await completeJson<{ signatureParagraphs?: string[] }>({
    system: `Extract 2–3 signature conviction paragraphs from brand editorial content as JSON only:
{"signatureParagraphs": string[]}
Rules:
- Each entry: one short paragraph (1–3 sentences) with operator "we" voice when present.
- Prefer paragraphs with strong opinions, rules, or selective stances — not generic overview.
- Copy text verbatim from the article; do not invent.
- Empty array if none found.`,
    user: trimmed,
    temperature: 0.2,
    maxTokens: 700,
  });

  const paragraphs = raw?.signatureParagraphs?.filter(
    (p) => typeof p === "string" && p.trim().length >= 20,
  );
  return paragraphs?.slice(0, 3).map((p) => p.trim()) ?? [];
}

/** Full kit extraction: deterministic + optional LLM when signatures are sparse. */
export async function extractComposeStyleKit(html: string): Promise<ComposeStyleKit> {
  const kit = extractComposeStyleKitDeterministic(html);
  if (kit.signatureParagraphs.length >= 2) return kit;

  try {
    const llmSignatures = await extractSignatureParagraphsWithLlm(html);
    if (!llmSignatures.length) return kit;
    return composeStyleKitSchema.parse({
      ...kit,
      signatureParagraphs: [...new Set([...kit.signatureParagraphs, ...llmSignatures])].slice(
        0,
        SIGNATURE_TARGET,
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
