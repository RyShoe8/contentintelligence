import type { Db } from "mongodb";
import {
  REWRITER_COMPOSE_GENERICITY_MAX,
  REWRITER_COMPOSE_HARD_VOICE_MAX_ATTEMPTS,
  REWRITER_MAX_HUMANIZATION_ATTEMPTS,
  hasComposeHardVoiceFailures,
  composeEffectiveBrandConsistency,
  composeGenericityScore,
  isComposeNarrativeFacts,
  isHybridContentFacts,
  isInstructionPreserveMode,
  isProceduralContentFacts,
  rewriterComposeCompletenessIssues,
  rewriterComposeQualityGatePassed,
  rewriterHybridQualityGatePassed,
  rewriterInstructionPreserveCompletenessIssues,
  rewriterProceduralCompletenessIssues,
  rewriterProceduralQualityGatePassed,
  rewriterQualityCompositeScore,
  rewriterQualityGatePassed,
  stripLeadingComposeChrome,
  writerComposeBriefOutlineIssues,
  writerComposeBrandMentionIssues,
  writerComposeConcretenessIssues,
  writerComposeFaqStyleIssues,
  writerComposeHowToStructureIssues,
  writerComposeOperatorVoiceIssues,
  writerComposeRhythmIssues,
  writerComposeReferenceLeakIssues,
  writerComposeTopicDriftIssues,
  writerComposeTopicSpecificityIssues,
  writerComposeDuplicateSectionIssues,
  writerComposeVoiceStyleIssues,
  writerComposeStyleIssueCounts,
  type ComposeArticleType,
  type ContentFacts,
  type GenericityAnalysis,
  type ComposeVoiceProfile,
  type SelfCritiqueResult,
  type VoiceFidelityResult,
  type WriterLink,
  scoreVoiceFidelity,
  voiceFidelityRetryIssues,
} from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import { env } from "../../env.js";
import type { ComposeArticleArchetype, ComposeStyleKitRhythm } from "@content-resourcer/db";
import { resolveVoiceGenerationContext } from "../../voice-generation-context.js";
import { interpretBrand } from "./brand-interpreter.js";
import { extractContentFacts } from "./fact-extractor.js";
import { retrieveRankedExamples } from "./example-retrieval.js";
import { analyzeGenericity } from "./generic-detector.js";
import { buildComposeStyleExampleExcerpt } from "./compose-style-excerpt.js";
import {
  resolveComposeArticleArchetype,
  resolvePrimaryKitRhythm,
} from "./compose-article-archetype.js";
import {
  applyManifestoArchetypeOverride,
  buildComposeHowToOutline,
  planComposeOutline,
  type ComposeOutline,
} from "./compose-outline.js";
import { humanizeArticleHtml } from "./humanizer.js";
import { reconstructArticleHtml } from "./reconstruction.js";
import { runSelfCritique } from "./self-critique.js";
import { buildVoiceQualityWarning } from "./compose-voice-quality.js";
import { composeRewritePassBudget } from "../llm/model-registry.js";
import { pickConcreteLens } from "./compose-topic-mode.js";
import type { ArticleRewriteExample } from "./types.js";

export { buildComposeStyleExampleExcerpt } from "./compose-style-excerpt.js";

export type HumanizationEngineOpts = {
  db: Db;
  voice: Voice;
  organizationId: string;
  sourceText: string;
  links: WriterLink[];
  writerArticleId?: string;
  preserveInstructions?: boolean;
  articleDepth?: number;
  subtopics?: string[];
  exactLinkLabels?: boolean;
  composeMode?: boolean;
  topic?: string;
  includeFaq?: boolean;
  articleType?: ComposeArticleType;
  /** Voice-shaped briefing prose handed to the writer alongside the JSON facts. */
  sourceProse?: string;
  /** Voice profile measured from this brand's style examples, for fidelity scoring. */
  voiceProfile?: ComposeVoiceProfile;
  /** Fidelity floor below which an attempt is treated as failing the gate. */
  voiceFidelityMin?: number;
};

export type HumanizationEngineResult = {
  html: string;
  sourceTruncated: boolean;
  facts: ContentFacts;
  examples: ArticleRewriteExample[];
  humanAuthenticityScore: number;
  brandConsistencyScore: number;
  genericityScore: number;
  humanizationAttempts: number;
  factsExtracted: boolean;
  voiceQualityWarning?: string;
  voiceFidelity: VoiceFidelityResult;
};

type AttemptSnapshot = {
  html: string;
  genericity: GenericityAnalysis;
  critique: SelfCritiqueResult;
  composite: number;
  completenessIssueCount: number;
  styleIssueCounts: ReturnType<typeof writerComposeStyleIssueCounts>;
  voiceFidelity: VoiceFidelityResult;
};

function mergeRetryIssues(
  genericity: GenericityAnalysis,
  critique: SelfCritiqueResult,
  completenessIssues: string[],
): string[] {
  const genericityIssue =
    composeGenericityScore(genericity, critique) > REWRITER_COMPOSE_GENERICITY_MAX
      ? [`Genericity score ${composeGenericityScore(genericity, critique)} exceeds max ${REWRITER_COMPOSE_GENERICITY_MAX}`]
      : [];
  return [
    ...new Set([
      ...completenessIssues,
      ...genericityIssue,
      ...genericity.issues,
      ...critique.issues,
    ]),
  ].slice(0, 12);
}

function factsExtracted(facts: ContentFacts): boolean {
  if (isHybridContentFacts(facts) || isProceduralContentFacts(facts)) return true;
  return facts.keyDetails.length > 0;
}

function qualityGatePassed(
  facts: ContentFacts,
  html: string,
  genericity: GenericityAnalysis,
  critique: SelfCritiqueResult,
  composeMode: boolean,
  composeGateOpts?: {
    includeFaq?: boolean;
    knownExampleTitles?: string[];
    faqItems?: { question: string; answer: string }[];
    brandName?: string;
    brandMentionLevel?: number;
    articleType?: ComposeArticleType;
    topic?: string;
  },
  composeHowTo?: boolean,
): boolean {
  if (composeMode && composeHowTo) {
    return rewriterComposeQualityGatePassed(facts, html, critique, genericity, composeGateOpts);
  }
  if (composeMode && isHybridContentFacts(facts)) {
    return rewriterHybridQualityGatePassed(facts, html, critique);
  }
  if (composeMode && isProceduralContentFacts(facts)) {
    return rewriterProceduralQualityGatePassed(facts, html, critique);
  }
  if (composeMode && isComposeNarrativeFacts(facts)) {
    return rewriterComposeQualityGatePassed(facts, html, critique, genericity, composeGateOpts);
  }
  if (isHybridContentFacts(facts)) {
    return rewriterHybridQualityGatePassed(facts, html, critique);
  }
  if (isProceduralContentFacts(facts)) {
    return rewriterProceduralQualityGatePassed(facts, html, critique);
  }
  return rewriterQualityGatePassed(genericity, critique);
}

/**
 * Rank attempts by critique composite *and* measured voice fidelity.
 *
 * Ranking on the critique score alone let a bland-but-clean draft beat a distinctly on-brand
 * one, since the critique rubric rewards the absence of problems rather than voice match.
 */
function snapshotScore(snapshot: AttemptSnapshot, preserveMode: boolean): number {
  const fidelityBonus = snapshot.voiceFidelity.measured
    ? (snapshot.voiceFidelity.score - 50) * 0.4
    : 0;
  const base = snapshot.composite + fidelityBonus;
  if (preserveMode) {
    return base - snapshot.completenessIssueCount * 15;
  }
  return base;
}

function effectiveBrandScore(
  critique: SelfCritiqueResult,
  styleCounts: ReturnType<typeof writerComposeStyleIssueCounts>,
): number {
  return composeEffectiveBrandConsistency(critique, styleCounts);
}

export async function runHumanizationEngine(
  opts: HumanizationEngineOpts,
): Promise<HumanizationEngineResult> {
  const composeMode = opts.composeMode === true;
  const sourceTrimmed = opts.sourceText.trim();
  const sourceTruncated = sourceTrimmed.length > env.maxWriterInputChars;
  const factsInput = sourceTruncated
    ? `${sourceTrimmed.slice(0, env.maxWriterInputChars)}\n\n[Source truncated for length.]`
    : sourceTrimmed;

  const facts = await extractContentFacts(factsInput, {
    preserveInstructions: opts.preserveInstructions,
    composeMode,
    includeFaq: opts.includeFaq,
    topic: opts.topic,
    subtopics: opts.subtopics,
    articleType: opts.articleType,
  });
  const composeHowTo = composeMode && opts.articleType === "how_to";
  const hybrid = isHybridContentFacts(facts);
  const composeNarrative = isComposeNarrativeFacts(facts);
  const proceduralOnly = isProceduralContentFacts(facts);
  const preserveMode = isInstructionPreserveMode(facts) || (composeMode && composeNarrative);
  const ctx = resolveVoiceGenerationContext(opts.voice);
  const interpretation = await interpretBrand(facts, ctx, {
    composeMode,
    topic: opts.topic,
  });
  const allExamples = await retrieveRankedExamples(
    opts.db,
    opts.organizationId,
    opts.voice,
    facts,
    opts.writerArticleId,
    { composeMode },
  );
  const examples = allExamples;
  const composeStyleExcerpt = composeMode ? buildComposeStyleExampleExcerpt(examples) : undefined;
  const knownExampleTitles = examples.map((ex) => ex.title).filter(Boolean);
  const composeProductUpdate = composeMode && opts.articleType === "product_update";
  const composeGateOpts = {
    includeFaq: opts.includeFaq,
    knownExampleTitles,
    faqItems: facts.faqItems,
    brandName: ctx.brandName,
    brandMentionLevel: ctx.brandMentionLevel,
    articleType: opts.articleType,
    topic: opts.topic,
    person: opts.voiceProfile?.sampleCount ? opts.voiceProfile.person : undefined,
  };

  const composeArchetype =
    composeMode && examples.length && opts.topic?.trim()
      ? applyManifestoArchetypeOverride(resolveComposeArticleArchetype(examples), opts.topic)
      : composeMode && examples.length
        ? resolveComposeArticleArchetype(examples)
        : undefined;
  const composeRhythm = composeMode ? resolvePrimaryKitRhythm(examples) : undefined;

  let composeOutline: ComposeOutline | undefined;
  let concreteLens: string | undefined;
  if (composeMode && opts.topic?.trim()) {
    concreteLens =
      composeHowTo ? undefined : await pickConcreteLens(opts.topic, facts.keyDetails);
    if (composeHowTo) {
      composeOutline = buildComposeHowToOutline({
        topic: opts.topic.trim(),
        facts,
        subtopics: opts.subtopics,
      });
    } else {
      composeOutline = await planComposeOutline({
        topic: opts.topic,
        subtopics: opts.subtopics,
        keyDetails: facts.keyDetails,
        faqItems: facts.faqItems,
        includeFaq: opts.includeFaq,
        examples,
        concreteLens,
      });
    }
  }

  let best: AttemptSnapshot | null = null;
  let retryIssues: string[] = [];
  let attempts = 0;
  /**
   * Attempts are capped by the platform rewrite-pass budget: every extra attempt is another
   * full reconstruct + humanize cycle, and each one pulls the prose further toward the model's
   * average. The hard ceiling stays as an upper bound.
   */
  const budgetedAttempts = Math.max(1, composeRewritePassBudget() + 1);
  const maxAttempts = composeMode
    ? Math.min(
        REWRITER_COMPOSE_HARD_VOICE_MAX_ATTEMPTS + (composeHowTo ? 2 : 0),
        budgetedAttempts + (composeHowTo ? 1 : 0),
      )
    : Math.min(REWRITER_MAX_HUMANIZATION_ATTEMPTS, budgetedAttempts);

  while (attempts < maxAttempts) {
    attempts++;
    let html = await reconstructArticleHtml({
      voice: opts.voice,
      ctx,
      facts,
      interpretation,
      examples,
      links: opts.links,
      retryIssues,
      attempt: attempts,
      articleDepth: opts.articleDepth,
      subtopics: opts.subtopics,
      exactLinkLabels: opts.exactLinkLabels,
      composeMode,
      topic: opts.topic,
      includeFaq: opts.includeFaq,
      composeOutline,
      composeArchetype,
      concreteLens,
      articleType: opts.articleType,
      sourceProse: opts.sourceProse,
    });
    html = await humanizeArticleHtml({
      voice: opts.voice,
      html,
      retryIssues,
      attempt: attempts,
      skip: proceduralOnly,
      proceduralLock: hybrid,
      composeMode,
      topic: opts.topic,
      styleExampleExcerpt: composeStyleExcerpt,
      includeFaq: opts.includeFaq,
      composeArchetype,
      composeRhythm,
    });
    if (composeMode) {
      html = stripLeadingComposeChrome(html);
    }

    const genericity = await analyzeGenericity(html);
    const critique = await runSelfCritique(html, facts, ctx, {
      composeMode,
      topic: opts.topic,
      styleExampleExcerpt: composeStyleExcerpt,
      includeFaq: opts.includeFaq,
      knownExampleTitles,
      articleType: opts.articleType,
      person: composeGateOpts.person,
    });
    const proceduralCompletenessIssues =
      composeMode && (isProceduralContentFacts(facts) || isHybridContentFacts(facts))
        ? rewriterProceduralCompletenessIssues(facts, html)
        : [];
    const howToStructureIssues =
      composeHowTo && opts.topic
        ? writerComposeHowToStructureIssues(html, opts.topic)
        : [];
    const brandMentionIssues = composeMode
      ? writerComposeBrandMentionIssues(html, ctx.brandName, ctx.brandMentionLevel)
      : [];
    const completenessIssues = preserveMode
      ? composeMode && isHybridContentFacts(facts)
        ? rewriterInstructionPreserveCompletenessIssues(facts, html)
        : composeMode && isProceduralContentFacts(facts)
          ? rewriterProceduralCompletenessIssues(facts, html)
          : composeMode && composeNarrative
            ? rewriterComposeCompletenessIssues(facts, html)
            : rewriterInstructionPreserveCompletenessIssues(facts, html)
      : [];
    /**
     * Topic drift penalises frequent brand mentions, which is correct for editorial articles
     * and exactly wrong for an announcement about our own product.
     */
    const topicDriftIssues =
      composeMode && opts.topic && !composeProductUpdate
        ? writerComposeTopicDriftIssues(html, opts.topic, ctx.brandName)
        : [];
    const topicSpecificityIssues =
      composeMode && composeHowTo && opts.topic
        ? writerComposeTopicSpecificityIssues(html, opts.topic, opts.subtopics)
        : [];
    const duplicateSectionIssues =
      composeMode && composeHowTo
        ? writerComposeDuplicateSectionIssues(html, opts.articleType, opts.includeFaq)
        : [];
    const briefOutlineIssues = composeMode ? writerComposeBriefOutlineIssues(html) : [];
    const voiceStyleIssues = composeMode ? writerComposeVoiceStyleIssues(html) : [];
    const operatorVoiceIssues = composeMode
      ? writerComposeOperatorVoiceIssues(html, { person: composeGateOpts.person })
      : [];
    const concretenessIssues =
      composeMode && !composeProductUpdate ? writerComposeConcretenessIssues(html) : [];
    const rhythmIssues = composeMode ? writerComposeRhythmIssues(html) : [];
    const leakIssues = composeMode
      ? writerComposeReferenceLeakIssues(html, knownExampleTitles)
      : [];
    const faqStyleIssues =
      composeMode && opts.includeFaq
        ? writerComposeFaqStyleIssues(html, facts.faqItems ?? [])
        : [];
    const styleIssueCounts = composeMode
      ? writerComposeStyleIssueCounts(html, composeGateOpts)
      : {
          voiceStyleIssueCount: 0,
          operatorVoiceIssueCount: 0,
          leakIssueCount: 0,
          faqStyleIssueCount: 0,
        };
    const voiceFidelity = composeMode
      ? scoreVoiceFidelity(html, opts.voiceProfile)
      : scoreVoiceFidelity(html, undefined);
    const fidelityIssues = composeMode
      ? voiceFidelityRetryIssues(voiceFidelity, opts.voiceFidelityMin ?? 0)
      : [];
    const composite = rewriterQualityCompositeScore(critique);
    const snapshot: AttemptSnapshot = {
      html,
      genericity,
      critique,
      voiceFidelity,
      composite,
      completenessIssueCount:
        completenessIssues.length +
        proceduralCompletenessIssues.length +
        topicDriftIssues.length +
        topicSpecificityIssues.length +
        duplicateSectionIssues.length +
        howToStructureIssues.length +
        brandMentionIssues.length +
        briefOutlineIssues.length +
        voiceStyleIssues.length +
        operatorVoiceIssues.length +
        leakIssues.length +
        faqStyleIssues.length +
        concretenessIssues.length +
        rhythmIssues.length +
        fidelityIssues.length,
      styleIssueCounts,
    };

    if (!best || snapshotScore(snapshot, preserveMode) > snapshotScore(best, preserveMode)) {
      best = snapshot;
    }

    const gateOk = qualityGatePassed(
      facts,
      html,
      genericity,
      critique,
      composeMode,
      composeMode ? composeGateOpts : undefined,
      composeHowTo,
    );
    const genericityOk =
      !composeMode ||
      composeGenericityScore(genericity, critique) <= REWRITER_COMPOSE_GENERICITY_MAX;
    const noDrift =
      topicDriftIssues.length === 0 &&
      topicSpecificityIssues.length === 0 &&
      duplicateSectionIssues.length === 0 &&
      howToStructureIssues.length === 0 &&
      brandMentionIssues.length === 0 &&
      proceduralCompletenessIssues.length === 0 &&
      briefOutlineIssues.length === 0 &&
      voiceStyleIssues.length === 0 &&
      operatorVoiceIssues.length === 0 &&
      leakIssues.length === 0 &&
      faqStyleIssues.length === 0 &&
      concretenessIssues.length === 0 &&
      rhythmIssues.length === 0 &&
      fidelityIssues.length === 0 &&
      genericityOk;

    if (gateOk && noDrift) {
      return {
        html: snapshot.html,
        sourceTruncated,
        facts,
        examples,
        humanAuthenticityScore: critique.humanAuthenticity,
        brandConsistencyScore: effectiveBrandScore(critique, styleIssueCounts),
        genericityScore: composeGenericityScore(genericity, critique),
        humanizationAttempts: attempts,
        factsExtracted: factsExtracted(facts),
        voiceFidelity,
      };
    }

    retryIssues = mergeRetryIssues(genericity, critique, [
      ...completenessIssues,
      ...proceduralCompletenessIssues,
      ...topicDriftIssues,
      ...topicSpecificityIssues,
      ...duplicateSectionIssues,
      ...howToStructureIssues,
      ...brandMentionIssues,
      ...briefOutlineIssues,
      ...voiceStyleIssues,
      ...operatorVoiceIssues,
      ...leakIssues,
      ...faqStyleIssues,
      ...concretenessIssues,
      ...rhythmIssues,
      ...fidelityIssues,
    ]);
  }

  const final = best!;
  const finalGenericityScore = composeGenericityScore(final.genericity, final.critique);
  const finalBc = effectiveBrandScore(final.critique, final.styleIssueCounts);
  const finalGenericityOk = finalGenericityScore <= REWRITER_COMPOSE_GENERICITY_MAX;
  const finalGateOk = qualityGatePassed(
    facts,
    final.html,
    final.genericity,
    final.critique,
    composeMode,
    composeMode ? composeGateOpts : undefined,
    composeHowTo,
  );
  const voiceQualityWarning = composeMode
    ? buildVoiceQualityWarning({
        gateOk: finalGateOk,
        noDrift:
          final.completenessIssueCount === 0 &&
          !hasComposeHardVoiceFailures(final.html, composeGateOpts),
        genericityOk: finalGenericityOk,
        effectiveBc: finalBc,
        genericityScore: finalGenericityScore,
        styleIssueCounts: final.styleIssueCounts,
        completenessIssues: [],
        voiceFidelity: final.voiceFidelity,
        voiceFidelityMin: opts.voiceFidelityMin,
      })
    : undefined;

  return {
    html: final.html,
    sourceTruncated,
    facts,
    examples,
    humanAuthenticityScore: final.critique.humanAuthenticity,
    brandConsistencyScore: finalBc,
    genericityScore: finalGenericityScore,
    humanizationAttempts: attempts,
    factsExtracted: factsExtracted(facts),
    voiceQualityWarning,
    voiceFidelity: final.voiceFidelity,
  };
}

export async function polishComposeHtmlVoice(opts: {
  voice: Voice;
  html: string;
  topic?: string;
  includeFaq?: boolean;
  styleExampleExcerpt?: string;
  retryIssues?: string[];
  composeArchetype?: ComposeArticleArchetype;
  composeRhythm?: ComposeStyleKitRhythm;
}): Promise<string> {
  const html = await humanizeArticleHtml({
    voice: opts.voice,
    html: opts.html,
    composeMode: true,
    topic: opts.topic,
    styleExampleExcerpt: opts.styleExampleExcerpt,
    includeFaq: opts.includeFaq,
    retryIssues: opts.retryIssues,
    attempt: opts.retryIssues?.length ? 2 : 1,
    composeArchetype: opts.composeArchetype,
    composeRhythm: opts.composeRhythm,
  });
  return stripLeadingComposeChrome(html);
}
