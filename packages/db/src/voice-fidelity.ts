import { z } from "zod";
import {
  composeVoiceProfileSchema,
  deriveComposeVoiceProfile,
  voicePersonLabel,
  type ComposeVoiceProfile,
} from "./compose-voice-profile.js";

/**
 * Voice fidelity: how closely generated output matches the brand's measured writing.
 *
 * The existing compose gates (genericity score, phrase blacklist, forbidden headings) all
 * measure the *absence of badness*. An article can pass every one of them and still be bland,
 * because nothing checks whether it resembles this particular brand. This scorer supplies the
 * missing positive signal by comparing the output's measurable characteristics against the
 * profile derived from the voice's own style examples.
 *
 * Deterministic on purpose — no LLM call, so it can run on every attempt without cost and
 * without another model's opinion drifting the result.
 */

export const voiceFidelityComponentSchema = z.object({
  name: z.string(),
  /** 0-100, where 100 means indistinguishable from the brand reference on this dimension. */
  score: z.number().min(0).max(100),
  weight: z.number().min(0),
  detail: z.string(),
});

export type VoiceFidelityComponent = z.infer<typeof voiceFidelityComponentSchema>;

export const voiceFidelityResultSchema = z.object({
  score: z.number().min(0).max(100),
  components: z.array(voiceFidelityComponentSchema),
  issues: z.array(z.string()),
  /** False when the voice has no style examples, so the score is not meaningful. */
  measured: z.boolean(),
});

export type VoiceFidelityResult = z.infer<typeof voiceFidelityResultSchema>;

/** Similarity of two ratios on a 0-100 scale, tolerant within `tolerance`. */
function ratioScore(actual: number, target: number, tolerance: number): number {
  const diff = Math.abs(actual - target);
  if (diff <= tolerance) return 100;
  const scaled = (diff - tolerance) / Math.max(tolerance, 0.0001);
  return Math.max(0, Math.round(100 - scaled * 50));
}

/** Similarity of two word counts, scored on proportional difference. */
function magnitudeScore(actual: number, target: number): number {
  if (target <= 0) return 100;
  const ratio = actual / target;
  const distance = Math.abs(Math.log(Math.max(ratio, 0.01)));
  return Math.max(0, Math.round(100 - distance * 90));
}

function booleanScore(actual: boolean, target: boolean): number {
  return actual === target ? 100 : 40;
}

const UNMEASURED_RESULT: VoiceFidelityResult = {
  score: 0,
  components: [],
  issues: [],
  measured: false,
};

export function scoreVoiceFidelity(
  html: string,
  reference: ComposeVoiceProfile | undefined,
): VoiceFidelityResult {
  const target = reference ? composeVoiceProfileSchema.parse(reference) : undefined;
  if (!target || target.sampleCount === 0) return { ...UNMEASURED_RESULT };

  const actual = deriveComposeVoiceProfile([html]);
  if (actual.sampleCount === 0) return { ...UNMEASURED_RESULT };

  const components: VoiceFidelityComponent[] = [];
  const issues: string[] = [];

  // Person is the single most audible voice marker, so it carries the most weight.
  const personScore = actual.person === target.person ? 100 : 25;
  components.push({
    name: "person",
    score: personScore,
    weight: 3,
    detail: `expected ${voicePersonLabel(target.person)}, got ${voicePersonLabel(actual.person)}`,
  });
  if (personScore < 100) {
    issues.push(
      `Voice fidelity: article is written in ${voicePersonLabel(actual.person)} but this brand writes in ${voicePersonLabel(target.person)}`,
    );
  }

  const paragraphScore = magnitudeScore(actual.avgParagraphWords, target.avgParagraphWords);
  components.push({
    name: "paragraphLength",
    score: paragraphScore,
    weight: 2,
    detail: `expected ~${Math.round(target.avgParagraphWords)} words/paragraph, got ~${Math.round(actual.avgParagraphWords)}`,
  });
  if (paragraphScore < 60) {
    const direction = actual.avgParagraphWords > target.avgParagraphWords ? "longer" : "shorter";
    issues.push(
      `Voice fidelity: paragraphs are much ${direction} than this brand's (${Math.round(actual.avgParagraphWords)} vs ~${Math.round(target.avgParagraphWords)} words)`,
    );
  }

  const shortShareScore = ratioScore(actual.shortParagraphShare, target.shortParagraphShare, 0.12);
  components.push({
    name: "shortParagraphShare",
    score: shortShareScore,
    weight: 1.5,
    detail: `expected ${Math.round(target.shortParagraphShare * 100)}% one-line paragraphs, got ${Math.round(actual.shortParagraphShare * 100)}%`,
  });

  const headingStyleScore = actual.headingStyle === target.headingStyle ? 100 : 45;
  components.push({
    name: "headingStyle",
    score: headingStyleScore,
    weight: 2,
    detail: `expected ${target.headingStyle} headings, got ${actual.headingStyle}`,
  });
  if (headingStyleScore < 100) {
    issues.push(
      `Voice fidelity: headings read as ${actual.headingStyle} but this brand's are ${target.headingStyle}`,
    );
  }

  const headingLengthScore = magnitudeScore(actual.headingAvgWords, target.headingAvgWords);
  components.push({
    name: "headingLength",
    score: headingLengthScore,
    weight: 1,
    detail: `expected ~${Math.round(target.headingAvgWords)} words/heading, got ~${Math.round(actual.headingAvgWords)}`,
  });

  const listScore = ratioScore(actual.listShare, target.listShare, 0.15);
  components.push({
    name: "listUsage",
    score: listScore,
    weight: 1,
    detail: `expected ${Math.round(target.listShare * 100)}% list blocks, got ${Math.round(actual.listShare * 100)}%`,
  });
  if (target.listShare <= 0.05 && actual.listShare >= 0.25) {
    issues.push("Voice fidelity: article leans on bullet lists but this brand writes in prose");
  }

  components.push({
    name: "fragments",
    score: booleanScore(actual.usesFragments, target.usesFragments),
    weight: 0.75,
    detail: `expected fragments=${target.usesFragments}, got ${actual.usesFragments}`,
  });

  components.push({
    name: "boldEmphasis",
    score: booleanScore(actual.usesBoldEmphasis, target.usesBoldEmphasis),
    weight: 0.75,
    detail: `expected bold=${target.usesBoldEmphasis}, got ${actual.usesBoldEmphasis}`,
  });

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weighted = components.reduce((sum, c) => sum + c.score * c.weight, 0);
  const score = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;

  return voiceFidelityResultSchema.parse({
    score,
    components,
    issues,
    measured: true,
  });
}

/** Compact retry-issue lines for the compose repair loop. */
export function voiceFidelityRetryIssues(
  result: VoiceFidelityResult,
  minScore: number,
): string[] {
  if (!result.measured || result.score >= minScore) return [];
  const weakest = [...result.components]
    .filter((c) => c.score < 70)
    .sort((a, b) => a.score * a.weight - b.score * b.weight)
    .slice(0, 3)
    .map((c) => `Voice fidelity (${c.name}): ${c.detail}`);
  return [...new Set([...result.issues, ...weakest])].slice(0, 5);
}

/** Warning text for the draft when fidelity is below the configured floor. */
export function voiceFidelityWarning(
  result: VoiceFidelityResult,
  minScore: number,
): string | undefined {
  if (!result.measured || result.score >= minScore) return undefined;
  const worst = [...result.components].sort((a, b) => a.score - b.score)[0];
  const detail = worst ? ` Weakest match: ${worst.name} (${worst.detail}).` : "";
  return `Voice fidelity ${result.score}/100 is below the ${minScore} threshold.${detail}`;
}
