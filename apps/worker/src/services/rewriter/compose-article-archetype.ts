import {
  composeArticleArchetypeSchema,
  sanitizeArticleHtmlForLearning,
  stripHtmlToPlainText,
  type ComposeArticleArchetype,
  type ComposeStyleKit,
} from "@content-resourcer/db";
import { extractHeadingsFromExampleHtml } from "./compose-style-excerpt.js";
import type { ArticleRewriteExample } from "./types.js";

const TYPOLOGY_TOUR_RE =
  /\b(?:active adult|memory care|assisted living|independent living|outdoor|technology|wellness)\b/i;

export const DEFAULT_COMPOSE_ARTICLE_ARCHETYPE: ComposeArticleArchetype =
  composeArticleArchetypeSchema.parse({
    sectionCount: 4,
    sampleHeadings: [
      "Opening conviction",
      "Principle in practice",
      "What we reject",
      "Closing stance",
    ],
    openingPattern: "Lead with operator conviction on the topic.",
    singleThreaded: true,
  });

const OPERATOR_CONVICTION_RE = /\b(?:we never|what we reject)\b/i;

function kitOperatorText(kit?: ComposeStyleKit): string {
  if (!kit) return "";
  return [...kit.signatureParagraphs, ...kit.openingParagraphs].join(" ");
}

function weVoiceDensityScore(text: string): number {
  const plain = text.trim();
  if (!plain) return 0;
  const words = plain.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const weCount = (plain.match(/\b(?:we|our|us)\b/gi) ?? []).length;
  return Math.min((weCount / words.length) * 100, 8);
}

function scoreStyleExample(ex: ArticleRewriteExample): number {
  const kit = ex.composeStyleKit;
  let score = 0;
  if (kit?.signatureParagraphs.length) score += kit.signatureParagraphs.length * 5;
  if (kit?.openingParagraphs.length) score += kit.openingParagraphs.length;
  if (kit?.headings.length) score += Math.min(kit.headings.length, 6);

  const operatorText = kitOperatorText(kit);
  if (OPERATOR_CONVICTION_RE.test(operatorText)) score += 4;
  score += weVoiceDensityScore(operatorText);

  if (kit?.headings.some((h) => TYPOLOGY_TOUR_RE.test(h))) score -= 3;
  if (ex.html?.length) score += Math.min(ex.html.length / 4000, 2);
  return score;
}

/** Pick the richest style example for archetype anchoring. */
export function pickPrimaryStyleExample(
  examples: ArticleRewriteExample[],
): ArticleRewriteExample | undefined {
  const withHtml = examples.filter((ex) => ex.html?.trim());
  if (!withHtml.length) return undefined;
  return [...withHtml].sort((a, b) => scoreStyleExample(b) - scoreStyleExample(a))[0];
}

export function extractComposeArticleArchetype(
  html: string,
  kit?: ComposeStyleKit,
): ComposeArticleArchetype {
  const sanitized = sanitizeArticleHtmlForLearning(html);
  const sampleHeadings = (kit?.headings.length ? kit.headings : extractHeadingsFromExampleHtml(sanitized))
    .filter((h) => h.length >= 3)
    .slice(0, 12);

  const h2Headings = sampleHeadings.slice(0, 10);
  const sectionCount = Math.max(2, Math.min(8, h2Headings.length || 4));

  const openingPattern =
    kit?.signatureParagraphs[0] ??
    kit?.openingParagraphs[0] ??
    (stripHtmlToPlainText(sanitized).slice(0, 200).trim() || undefined);

  const typologyHits = h2Headings.filter((h) => TYPOLOGY_TOUR_RE.test(h)).length;
  const singleThreaded =
    sectionCount <= 6 && typologyHits <= 1 && h2Headings.length <= 8;

  return composeArticleArchetypeSchema.parse({
    sectionCount,
    sampleHeadings: h2Headings.length ? h2Headings : DEFAULT_COMPOSE_ARTICLE_ARCHETYPE.sampleHeadings,
    openingPattern,
    singleThreaded,
  });
}

export function resolveComposeArticleArchetype(
  examples: ArticleRewriteExample[],
): ComposeArticleArchetype {
  const primary = pickPrimaryStyleExample(examples);
  if (!primary?.html?.trim()) return DEFAULT_COMPOSE_ARTICLE_ARCHETYPE;

  const stored = primary.composeStyleKit?.archetype;
  if (stored) return stored;

  return extractComposeArticleArchetype(primary.html, primary.composeStyleKit);
}

/** Rhythm metrics from the primary style example kit, when present. */
export function resolvePrimaryKitRhythm(
  examples: ArticleRewriteExample[],
): ComposeStyleKit["rhythm"] {
  return pickPrimaryStyleExample(examples)?.composeStyleKit?.rhythm;
}

export function attachArchetypeToStyleKit(
  kit: ComposeStyleKit,
  html: string,
): ComposeStyleKit {
  return {
    ...kit,
    archetype: kit.archetype ?? extractComposeArticleArchetype(html, kit),
  };
}
