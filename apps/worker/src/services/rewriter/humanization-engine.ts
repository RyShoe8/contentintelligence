import type { Db } from "mongodb";
import {
  REWRITER_COMPOSE_GENERICITY_MAX,
  REWRITER_MAX_HUMANIZATION_ATTEMPTS,
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
  rewriterProceduralQualityGatePassed,
  rewriterQualityCompositeScore,
  rewriterQualityGatePassed,
  stripLeadingComposeChrome,
  writerComposeBriefOutlineIssues,
  writerComposeFaqStyleIssues,
  writerComposeOperatorVoiceIssues,
  writerComposeReferenceLeakIssues,
  writerComposeTopicDriftIssues,
  writerComposeVoiceStyleIssues,
  writerComposeStyleIssueCounts,
  type ContentFacts,
  type GenericityAnalysis,
  type SelfCritiqueResult,
  type WriterLink,
} from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import { env } from "../../env.js";
import { resolveVoiceGenerationContext } from "../../voice-generation-context.js";
import { interpretBrand } from "./brand-interpreter.js";
import { extractContentFacts } from "./fact-extractor.js";
import { retrieveRankedExamples } from "./example-retrieval.js";
import { analyzeGenericity } from "./generic-detector.js";
import { buildComposeStyleExampleExcerpt } from "./compose-style-excerpt.js";
import { humanizeArticleHtml } from "./humanizer.js";
import { reconstructArticleHtml } from "./reconstruction.js";
import { runSelfCritique } from "./self-critique.js";
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
};

type AttemptSnapshot = {
  html: string;
  genericity: GenericityAnalysis;
  critique: SelfCritiqueResult;
  composite: number;
  completenessIssueCount: number;
  styleIssueCounts: ReturnType<typeof writerComposeStyleIssueCounts>;
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
  composeGateOpts?: { includeFaq?: boolean; knownExampleTitles?: string[] },
): boolean {
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

function snapshotScore(snapshot: AttemptSnapshot, preserveMode: boolean): number {
  if (preserveMode) {
    return snapshot.composite - snapshot.completenessIssueCount * 15;
  }
  return snapshot.composite;
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
  });
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
  const composeGateOpts = {
    includeFaq: opts.includeFaq,
    knownExampleTitles,
  };

  let best: AttemptSnapshot | null = null;
  let retryIssues: string[] = [];
  let attempts = 0;

  while (attempts < REWRITER_MAX_HUMANIZATION_ATTEMPTS) {
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
    });
    const completenessIssues = preserveMode
      ? composeMode && composeNarrative
        ? rewriterComposeCompletenessIssues(facts, html)
        : rewriterInstructionPreserveCompletenessIssues(facts, html)
      : [];
    const topicDriftIssues =
      composeMode && opts.topic
        ? writerComposeTopicDriftIssues(html, opts.topic, ctx.brandName)
        : [];
    const briefOutlineIssues = composeMode ? writerComposeBriefOutlineIssues(html) : [];
    const voiceStyleIssues = composeMode ? writerComposeVoiceStyleIssues(html) : [];
    const operatorVoiceIssues = composeMode ? writerComposeOperatorVoiceIssues(html) : [];
    const leakIssues = composeMode
      ? writerComposeReferenceLeakIssues(html, knownExampleTitles)
      : [];
    const faqStyleIssues =
      composeMode && opts.includeFaq ? writerComposeFaqStyleIssues(html) : [];
    const styleIssueCounts = composeMode
      ? writerComposeStyleIssueCounts(html, composeGateOpts)
      : {
          voiceStyleIssueCount: 0,
          operatorVoiceIssueCount: 0,
          leakIssueCount: 0,
          faqStyleIssueCount: 0,
        };
    const composite = rewriterQualityCompositeScore(critique);
    const snapshot: AttemptSnapshot = {
      html,
      genericity,
      critique,
      composite,
      completenessIssueCount:
        completenessIssues.length +
        topicDriftIssues.length +
        briefOutlineIssues.length +
        voiceStyleIssues.length +
        operatorVoiceIssues.length +
        leakIssues.length +
        faqStyleIssues.length,
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
    );
    const genericityOk =
      !composeMode ||
      composeGenericityScore(genericity, critique) <= REWRITER_COMPOSE_GENERICITY_MAX;
    const noDrift =
      topicDriftIssues.length === 0 &&
      briefOutlineIssues.length === 0 &&
      voiceStyleIssues.length === 0 &&
      operatorVoiceIssues.length === 0 &&
      leakIssues.length === 0 &&
      faqStyleIssues.length === 0 &&
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
      };
    }

    retryIssues = mergeRetryIssues(genericity, critique, [
      ...completenessIssues,
      ...topicDriftIssues,
      ...briefOutlineIssues,
      ...voiceStyleIssues,
      ...operatorVoiceIssues,
      ...leakIssues,
      ...faqStyleIssues,
    ]);
  }

  const final = best!;
  return {
    html: final.html,
    sourceTruncated,
    facts,
    examples,
    humanAuthenticityScore: final.critique.humanAuthenticity,
    brandConsistencyScore: effectiveBrandScore(final.critique, final.styleIssueCounts),
    genericityScore: composeGenericityScore(final.genericity, final.critique),
    humanizationAttempts: attempts,
    factsExtracted: factsExtracted(facts),
  };
}

export async function polishComposeHtmlVoice(opts: {
  voice: Voice;
  html: string;
  topic?: string;
  includeFaq?: boolean;
  styleExampleExcerpt?: string;
  retryIssues?: string[];
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
  });
  return stripLeadingComposeChrome(html);
}
