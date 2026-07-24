import {
  REWRITER_COMPOSE_GENERICITY_MAX,
  REWRITER_COMPOSE_BRAND_CONSISTENCY_MIN,
  composeEffectiveBrandConsistency,
  composeGenericityScore,
  hasComposeHardVoiceFailures,
  rewriterComposeCompletenessIssues,
  rewriterComposeQualityGatePassed,
  writerComposeConcretenessIssues,
  writerComposeOperatorVoiceIssues,
  writerComposeRhythmIssues,
  writerComposeStyleIssueCounts,
  type ComposeArticleType,
  type ComposeStyleIssueCounts,
  type ContentFacts,
  type GenericityAnalysis,
  type SelfCritiqueResult,
  type VoiceFidelityResult,
} from "@content-resourcer/db";

export type ComposeVoiceQualityOpts = {
  includeFaq?: boolean;
  knownExampleTitles?: string[];
  faqItems?: { question: string; answer: string }[];
  brandName?: string;
  brandMentionLevel?: number;
  articleType?: ComposeArticleType;
  topic?: string;
  /** Grammatical person measured from this brand's style examples. */
  person?: "first_plural" | "first_singular" | "second" | "third";
};

export function composeStyleIssueTotal(counts: ComposeStyleIssueCounts): number {
  return (
    counts.voiceStyleIssueCount +
    counts.operatorVoiceIssueCount +
    counts.leakIssueCount +
    counts.faqStyleIssueCount
  );
}

export function shouldRunComposeVoicePolish(opts: {
  linksWoven: number;
  linksRevised: boolean;
  styleIssueCounts: ComposeStyleIssueCounts;
  genericityScore: number;
}): boolean {
  return (
    opts.linksWoven > 0 ||
    opts.linksRevised ||
    composeStyleIssueTotal(opts.styleIssueCounts) > 0 ||
    opts.genericityScore > REWRITER_COMPOSE_GENERICITY_MAX
  );
}

export function shouldRunComposeFinalPolish(opts: {
  html: string;
  genericityScore: number;
  composeGateOpts?: ComposeVoiceQualityOpts;
}): boolean {
  const styleIssueCounts = writerComposeStyleIssueCounts(opts.html, opts.composeGateOpts ?? {});
  return (
    opts.genericityScore > REWRITER_COMPOSE_GENERICITY_MAX ||
    composeStyleIssueTotal(styleIssueCounts) > 0 ||
    writerComposeOperatorVoiceIssues(opts.html, {
      person: opts.composeGateOpts?.person,
    }).length > 0 ||
    writerComposeConcretenessIssues(opts.html).length > 0 ||
    writerComposeRhythmIssues(opts.html).length > 0
  );
}

export function buildVoiceQualityWarning(opts: {
  gateOk: boolean;
  noDrift: boolean;
  genericityOk: boolean;
  effectiveBc: number;
  genericityScore: number;
  styleIssueCounts: ComposeStyleIssueCounts;
  completenessIssues: string[];
  voiceFidelity?: VoiceFidelityResult;
  voiceFidelityMin?: number;
}): string | undefined {
  const fidelityMin = opts.voiceFidelityMin ?? 0;
  const fidelityLow =
    opts.voiceFidelity?.measured === true && opts.voiceFidelity.score < fidelityMin;

  if (opts.gateOk && opts.noDrift && opts.genericityOk && !fidelityLow) return undefined;
  const parts: string[] = [];
  if (fidelityLow && opts.voiceFidelity) {
    parts.push(`Voice fidelity ${opts.voiceFidelity.score}/100 below target ${fidelityMin}`);
    if (opts.voiceFidelity.issues[0]) {
      parts.push(opts.voiceFidelity.issues[0].replace(/^Voice fidelity: /, ""));
    }
  }
  if (!opts.genericityOk) {
    parts.push(
      `Genericity ${opts.genericityScore} exceeds max ${REWRITER_COMPOSE_GENERICITY_MAX}`,
    );
  }
  if (opts.effectiveBc < REWRITER_COMPOSE_BRAND_CONSISTENCY_MIN) {
    parts.push(
      `Brand consistency ${opts.effectiveBc} below target ${REWRITER_COMPOSE_BRAND_CONSISTENCY_MIN}`,
    );
  }
  if (composeStyleIssueTotal(opts.styleIssueCounts) > 0) {
    parts.push("Voice style checks flagged generic or off-brand patterns");
  }
  if (opts.completenessIssues.length > 0) {
    parts.push(opts.completenessIssues[0]!);
  }
  return parts.length
    ? `${parts.join("; ")}. Review before publishing.`
    : "Voice quality did not fully pass. Review before publishing.";
}

export function evaluateComposeVoiceQuality(opts: {
  facts: ContentFacts;
  html: string;
  critique: SelfCritiqueResult;
  genericity: GenericityAnalysis;
  composeGateOpts?: ComposeVoiceQualityOpts;
  voiceFidelity?: VoiceFidelityResult;
  voiceFidelityMin?: number;
}): {
  genericityScore: number;
  brandConsistencyScore: number;
  styleIssueCounts: ComposeStyleIssueCounts;
  voiceQualityWarning?: string;
} {
  const styleIssueCounts = writerComposeStyleIssueCounts(opts.html, opts.composeGateOpts ?? {});
  const completenessIssues = rewriterComposeCompletenessIssues(opts.facts, opts.html);
  const genericityScore = composeGenericityScore(opts.genericity, opts.critique);
  const brandConsistencyScore = composeEffectiveBrandConsistency(opts.critique, styleIssueCounts);
  const genericityOk = genericityScore <= REWRITER_COMPOSE_GENERICITY_MAX;
  const gateOk = rewriterComposeQualityGatePassed(
    opts.facts,
    opts.html,
    opts.critique,
    opts.genericity,
    opts.composeGateOpts,
  );
  const noDrift =
    completenessIssues.length === 0 &&
    composeStyleIssueTotal(styleIssueCounts) === 0 &&
    genericityOk &&
    !hasComposeHardVoiceFailures(opts.html, opts.composeGateOpts ?? {});
  const voiceQualityWarning = buildVoiceQualityWarning({
    gateOk,
    noDrift,
    genericityOk,
    effectiveBc: brandConsistencyScore,
    genericityScore,
    styleIssueCounts,
    completenessIssues,
    voiceFidelity: opts.voiceFidelity,
    voiceFidelityMin: opts.voiceFidelityMin,
  });
  return {
    genericityScore,
    brandConsistencyScore,
    styleIssueCounts,
    voiceQualityWarning,
  };
}
