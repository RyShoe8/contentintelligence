import { z } from "zod";

export const contentFactsSchema = z.object({
  offer: z.string().trim().optional(),
  depositAmount: z.string().trim().optional(),
  bonusAmount: z.string().trim().optional(),
  casino: z.string().trim().optional(),
  expiration: z.string().trim().optional(),
  sourceUrl: z.string().trim().optional(),
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
