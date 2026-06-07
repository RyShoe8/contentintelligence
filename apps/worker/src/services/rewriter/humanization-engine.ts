import type { Db } from "mongodb";
import {
  REWRITER_MAX_HUMANIZATION_ATTEMPTS,
  isHybridContentFacts,
  isInstructionPreserveMode,
  isProceduralContentFacts,
  rewriterHybridQualityGatePassed,
  rewriterInstructionPreserveCompletenessIssues,
  rewriterProceduralQualityGatePassed,
  rewriterQualityCompositeScore,
  rewriterQualityGatePassed,
  writerComposeTopicDriftIssues,
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
import { humanizeArticleHtml } from "./humanizer.js";
import { reconstructArticleHtml } from "./reconstruction.js";
import { runSelfCritique } from "./self-critique.js";
import type { ArticleRewriteExample } from "./types.js";

const COMPOSE_BRIEF_EXCERPT_CHARS = 6000;
const COMPOSE_MAX_EXAMPLES = 2;

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
};

function mergeRetryIssues(
  genericity: GenericityAnalysis,
  critique: SelfCritiqueResult,
  completenessIssues: string[],
): string[] {
  return [...new Set([...completenessIssues, ...genericity.issues, ...critique.issues])].slice(
    0,
    12,
  );
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
): boolean {
  if (composeMode && isHybridContentFacts(facts)) {
    return rewriterHybridQualityGatePassed(facts, html, critique);
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
  });
  const hybrid = isHybridContentFacts(facts);
  const proceduralOnly = isProceduralContentFacts(facts);
  const preserveMode = isInstructionPreserveMode(facts) || (composeMode && hybrid);
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
  );
  const examples = composeMode ? allExamples.slice(0, COMPOSE_MAX_EXAMPLES) : allExamples;

  const researchBriefExcerpt = composeMode
    ? factsInput.slice(0, COMPOSE_BRIEF_EXCERPT_CHARS)
    : undefined;

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
      researchBriefExcerpt,
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
    });

    const genericity = await analyzeGenericity(html);
    const critique = await runSelfCritique(html, facts, ctx, {
      composeMode,
      topic: opts.topic,
    });
    const completenessIssues = preserveMode
      ? rewriterInstructionPreserveCompletenessIssues(facts, html)
      : [];
    const topicDriftIssues =
      composeMode && opts.topic
        ? writerComposeTopicDriftIssues(html, opts.topic, ctx.brandName)
        : [];
    const composite = rewriterQualityCompositeScore(critique);
    const snapshot: AttemptSnapshot = {
      html,
      genericity,
      critique,
      composite,
      completenessIssueCount: completenessIssues.length + topicDriftIssues.length,
    };

    if (!best || snapshotScore(snapshot, preserveMode) > snapshotScore(best, preserveMode)) {
      best = snapshot;
    }

    const gateOk = qualityGatePassed(facts, html, genericity, critique, composeMode);
    const noDrift = topicDriftIssues.length === 0;

    if (gateOk && noDrift) {
      return {
        html: snapshot.html,
        sourceTruncated,
        facts,
        examples,
        humanAuthenticityScore: critique.humanAuthenticity,
        brandConsistencyScore: critique.brandConsistency,
        genericityScore: Math.max(genericity.score, critique.genericity),
        humanizationAttempts: attempts,
        factsExtracted: factsExtracted(facts),
      };
    }

    retryIssues = mergeRetryIssues(genericity, critique, [
      ...completenessIssues,
      ...topicDriftIssues,
    ]);
  }

  const final = best!;
  return {
    html: final.html,
    sourceTruncated,
    facts,
    examples,
    humanAuthenticityScore: final.critique.humanAuthenticity,
    brandConsistencyScore: final.critique.brandConsistency,
    genericityScore: Math.max(final.genericity.score, final.critique.genericity),
    humanizationAttempts: attempts,
    factsExtracted: factsExtracted(facts),
  };
}
