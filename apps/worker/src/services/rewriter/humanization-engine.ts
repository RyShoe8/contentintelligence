import type { Db } from "mongodb";
import {
  REWRITER_MAX_HUMANIZATION_ATTEMPTS,
  rewriterQualityCompositeScore,
  rewriterQualityGatePassed,
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

export type HumanizationEngineOpts = {
  db: Db;
  voice: Voice;
  organizationId: string;
  sourceText: string;
  links: WriterLink[];
  writerArticleId?: string;
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
};

function mergeRetryIssues(
  genericity: GenericityAnalysis,
  critique: SelfCritiqueResult,
): string[] {
  return [...new Set([...genericity.issues, ...critique.issues])].slice(0, 10);
}

export async function runHumanizationEngine(
  opts: HumanizationEngineOpts,
): Promise<HumanizationEngineResult> {
  const sourceTrimmed = opts.sourceText.trim();
  const sourceTruncated = sourceTrimmed.length > env.maxWriterInputChars;
  const factsInput = sourceTruncated
    ? `${sourceTrimmed.slice(0, env.maxWriterInputChars)}\n\n[Source truncated for length.]`
    : sourceTrimmed;

  const facts = await extractContentFacts(factsInput);
  const ctx = resolveVoiceGenerationContext(opts.voice);
  const interpretation = await interpretBrand(facts, ctx);
  const examples = await retrieveRankedExamples(
    opts.db,
    opts.organizationId,
    opts.voice,
    facts,
    opts.writerArticleId,
  );

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
    });
    html = await humanizeArticleHtml({
      voice: opts.voice,
      html,
      retryIssues,
      attempt: attempts,
    });

    const genericity = await analyzeGenericity(html);
    const critique = await runSelfCritique(html, facts, ctx);
    const composite = rewriterQualityCompositeScore(critique);
    const snapshot: AttemptSnapshot = { html, genericity, critique, composite };

    if (!best || composite > best.composite) {
      best = snapshot;
    }

    if (rewriterQualityGatePassed(genericity, critique)) {
      return {
        html: snapshot.html,
        sourceTruncated,
        facts,
        examples,
        humanAuthenticityScore: critique.humanAuthenticity,
        brandConsistencyScore: critique.brandConsistency,
        genericityScore: Math.max(genericity.score, critique.genericity),
        humanizationAttempts: attempts,
        factsExtracted: facts.keyDetails.length > 0,
      };
    }

    retryIssues = mergeRetryIssues(genericity, critique);
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
    factsExtracted: facts.keyDetails.length > 0,
  };
}
