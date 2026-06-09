import { z } from "zod";
import { stripHtmlToPlainText } from "./writer-validation.js";

export const proceduralSectionSchema = z.object({
  title: z.string().trim().min(1),
  steps: z.array(z.string().trim().min(1)).min(1),
});

export type ProceduralSection = z.infer<typeof proceduralSectionSchema>;

export const narrativeSectionSchema = z.object({
  title: z.string().trim().min(1),
  points: z.array(z.string().trim().min(1)).min(1),
});

export type NarrativeSection = z.infer<typeof narrativeSectionSchema>;

export const contentFactsSchema = z.object({
  offer: z.string().trim().optional(),
  depositAmount: z.string().trim().optional(),
  bonusAmount: z.string().trim().optional(),
  casino: z.string().trim().optional(),
  expiration: z.string().trim().optional(),
  sourceUrl: z.string().trim().optional(),
  contentType: z.enum(["general", "procedural", "hybrid"]).default("general"),
  narrativeSections: z.array(narrativeSectionSchema).optional(),
  sections: z.array(proceduralSectionSchema).optional(),
  keyDetails: z.array(z.string().trim()).default([]),
});

export type ContentFacts = z.infer<typeof contentFactsSchema>;

export const brandInterpretationSchema = z.object({
  assessment: z.string().trim().min(1),
  qualityScore: z.coerce.number().min(0).max(10),
  bestFor: z.string().trim().min(1),
  risks: z.array(z.string().trim()).default([]),
  caveats: z.array(z.string().trim()).default([]),
  opportunities: z.array(z.string().trim()).default([]),
});

export type BrandInterpretation = z.infer<typeof brandInterpretationSchema>;

export const genericityAnalysisSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  issues: z.array(z.string().trim()).default([]),
});

export type GenericityAnalysis = z.infer<typeof genericityAnalysisSchema>;

export const selfCritiqueResultSchema = z.object({
  humanAuthenticity: z.coerce.number().min(0).max(100),
  brandConsistency: z.coerce.number().min(0).max(100),
  genericity: z.coerce.number().min(0).max(100),
  issues: z.array(z.string().trim()).default([]),
});

export type SelfCritiqueResult = z.infer<typeof selfCritiqueResultSchema>;

export const humanFingerprintsPatchSchema = z.object({
  favoriteOpenings: z.array(z.string().trim()).optional(),
  favoriteClosings: z.array(z.string().trim()).optional(),
  favoriteTransitions: z.array(z.string().trim()).optional(),
  recurringOpinions: z.array(z.string().trim()).optional(),
  recurringWarnings: z.array(z.string().trim()).optional(),
});

export type HumanFingerprintsPatch = z.infer<typeof humanFingerprintsPatchSchema>;

export const REWRITER_GENERICITY_FAIL_THRESHOLD = 70;
export const REWRITER_HUMAN_AUTHENTICITY_MIN = 80;
export const REWRITER_BRAND_CONSISTENCY_MIN = 80;
export const REWRITER_SELF_CRITIQUE_GENERICITY_MAX = 30;
export const REWRITER_MAX_HUMANIZATION_ATTEMPTS = 3;
export const REWRITER_COMPOSE_HUMAN_AUTHENTICITY_MIN = 85;
export const REWRITER_COMPOSE_BRAND_CONSISTENCY_MIN = 85;

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textPresentInPlain(text: string, plain: string): boolean {
  const normalizedPlain = normalizeForMatch(plain);
  const normalizedText = normalizeForMatch(text);
  if (!normalizedText) return true;
  if (normalizedPlain.includes(normalizedText)) return true;

  const words = normalizedText.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return true;
  const matched = words.filter((w) => normalizedPlain.includes(w)).length;
  return matched / words.length >= 0.6;
}

export function isProceduralContentFacts(facts: ContentFacts): boolean {
  return facts.contentType === "procedural" && (facts.sections?.length ?? 0) > 0;
}

export function isHybridContentFacts(facts: ContentFacts): boolean {
  return (
    facts.contentType === "hybrid" &&
    (facts.narrativeSections?.length ?? 0) > 0 &&
    (facts.sections?.length ?? 0) > 0
  );
}

/** Compose research briefs: hybrid contentType with narrative blocks (may lack procedural sections). */
export function isComposeNarrativeFacts(facts: ContentFacts): boolean {
  return facts.contentType === "hybrid" && (facts.narrativeSections?.length ?? 0) > 0;
}

export function isInstructionPreserveMode(facts: ContentFacts): boolean {
  return isHybridContentFacts(facts) || isProceduralContentFacts(facts);
}

export function rewriterProceduralCompletenessIssues(
  facts: ContentFacts,
  html: string,
): string[] {
  const hasProceduralSections =
    (facts.contentType === "procedural" || facts.contentType === "hybrid") &&
    (facts.sections?.length ?? 0) > 0;
  if (!hasProceduralSections || !facts.sections) return [];

  const plain = stripHtmlToPlainText(html);
  const issues: string[] = [];

  for (const section of facts.sections) {
    const titleNorm = normalizeForMatch(section.title);
    if (titleNorm && !normalizeForMatch(plain).includes(titleNorm)) {
      issues.push(`Missing section heading: "${section.title}"`);
    }

    let missingSteps = 0;
    for (const step of section.steps) {
      if (!textPresentInPlain(step, plain)) missingSteps++;
    }
    if (missingSteps > 0) {
      issues.push(
        `Section "${section.title}" is missing ${missingSteps}/${section.steps.length} steps`,
      );
    }
  }

  return issues;
}

export function rewriterNarrativeCompletenessIssues(
  facts: ContentFacts,
  html: string,
): string[] {
  if (!isHybridContentFacts(facts) || !facts.narrativeSections) return [];

  const plain = stripHtmlToPlainText(html);
  const issues: string[] = [];

  for (const section of facts.narrativeSections) {
    const titleNorm = normalizeForMatch(section.title);
    if (titleNorm && !normalizeForMatch(plain).includes(titleNorm)) {
      issues.push(`Missing narrative section: "${section.title}"`);
    }

    let missingPoints = 0;
    for (const point of section.points) {
      if (!textPresentInPlain(point, plain)) missingPoints++;
    }
    if (missingPoints > 0) {
      issues.push(
        `Narrative section "${section.title}" is missing ${missingPoints}/${section.points.length} key points`,
      );
    }
  }

  return issues;
}

/** Compose completeness: all facts present, but research-brief section titles are not required as headings. */
export function writerComposeNarrativeCompletenessIssues(
  facts: ContentFacts,
  html: string,
): string[] {
  if (!isComposeNarrativeFacts(facts) || !facts.narrativeSections) return [];

  const plain = stripHtmlToPlainText(html);
  const issues: string[] = [];

  for (const section of facts.narrativeSections) {
    let missingPoints = 0;
    for (const point of section.points) {
      if (!textPresentInPlain(point, plain)) missingPoints++;
    }
    if (missingPoints > 0) {
      issues.push(
        `Missing ${missingPoints}/${section.points.length} research facts from "${section.title}"`,
      );
    }
  }

  let missingKeyDetails = 0;
  for (const detail of facts.keyDetails) {
    if (!textPresentInPlain(detail, plain)) missingKeyDetails++;
  }
  if (missingKeyDetails > 0) {
    issues.push(
      `Missing ${missingKeyDetails}/${facts.keyDetails.length} key detail facts`,
    );
  }

  return [...issues, ...rewriterProceduralCompletenessIssues(facts, html)];
}

export function rewriterComposeCompletenessIssues(
  facts: ContentFacts,
  html: string,
): string[] {
  return writerComposeNarrativeCompletenessIssues(facts, html);
}

export function rewriterInstructionPreserveCompletenessIssues(
  facts: ContentFacts,
  html: string,
): string[] {
  return [
    ...rewriterProceduralCompletenessIssues(facts, html),
    ...rewriterNarrativeCompletenessIssues(facts, html),
  ];
}

export function rewriterQualityCompositeScore(critique: SelfCritiqueResult): number {
  const genericPenalty = critique.genericity;
  return Math.round(
    (critique.humanAuthenticity + critique.brandConsistency + (100 - genericPenalty)) / 3,
  );
}

export function rewriterQualityGatePassed(
  genericity: GenericityAnalysis,
  critique: SelfCritiqueResult,
): boolean {
  if (genericity.score > REWRITER_GENERICITY_FAIL_THRESHOLD) return false;
  if (critique.humanAuthenticity < REWRITER_HUMAN_AUTHENTICITY_MIN) return false;
  if (critique.brandConsistency < REWRITER_BRAND_CONSISTENCY_MIN) return false;
  if (critique.genericity > REWRITER_SELF_CRITIQUE_GENERICITY_MAX) return false;
  return true;
}

export function rewriterProceduralQualityGatePassed(
  facts: ContentFacts,
  html: string,
  critique: SelfCritiqueResult,
): boolean {
  const completenessIssues = rewriterProceduralCompletenessIssues(facts, html);
  if (completenessIssues.length > 0) return false;
  if (critique.humanAuthenticity < REWRITER_HUMAN_AUTHENTICITY_MIN) return false;
  if (critique.brandConsistency < REWRITER_BRAND_CONSISTENCY_MIN) return false;
  return true;
}

export function rewriterHybridQualityGatePassed(
  facts: ContentFacts,
  html: string,
  critique: SelfCritiqueResult,
): boolean {
  const completenessIssues = rewriterInstructionPreserveCompletenessIssues(facts, html);
  if (completenessIssues.length > 0) return false;
  if (critique.humanAuthenticity < REWRITER_HUMAN_AUTHENTICITY_MIN) return false;
  if (critique.brandConsistency < REWRITER_BRAND_CONSISTENCY_MIN) return false;
  return true;
}

export function rewriterComposeQualityGatePassed(
  facts: ContentFacts,
  html: string,
  critique: SelfCritiqueResult,
): boolean {
  const completenessIssues = rewriterComposeCompletenessIssues(facts, html);
  if (completenessIssues.length > 0) return false;
  if (critique.humanAuthenticity < REWRITER_COMPOSE_HUMAN_AUTHENTICITY_MIN) return false;
  if (critique.brandConsistency < REWRITER_COMPOSE_BRAND_CONSISTENCY_MIN) return false;
  return true;
}
