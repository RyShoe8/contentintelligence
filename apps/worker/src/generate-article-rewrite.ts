import type { Db } from "mongodb";
import {
  brandInterpretationSchema,
  contentFactsSchema,
  formatWriterLinksForPrompt,
  type Voice,
  type WriterLink,
  writerLinksPresentCount,
  writerNonRequestedLinksInHtml,
  writerRequestedLinksAdded,
  writerRequestedLinksCarriedFromSource,
  writerRewriteDivergenceScore,
} from "@content-resourcer/db";
import { writerArticleHtmlForLearning, type WriterArticle } from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "./env.js";
import { resolveVoiceGenerationContext } from "./voice-generation-context.js";
import { runHumanizationEngine } from "./services/rewriter/humanization-engine.js";
import {
  loadPrimaryStyleExampleForTransfer,
  runStyleTransferPass,
  shouldRunStyleTransfer,
} from "./services/rewriter/style-transfer.js";
import { buildReconstructionSystemPrompt } from "./services/rewriter/reconstruction.js";
import type { ArticleRewriteExample } from "./services/rewriter/types.js";
import { applyWriterLinkPipeline } from "./writer-link-pipeline.js";

export type { ArticleRewriteExample };

const MAX_EXPAND_RETRIES = 2;
const EXPAND_TEMPERATURE_STEP = 0.08;
const EXPAND_TEMPERATURE_MAX = 0.95;

const LINK_WEAVE_RULES = `
Link integration:
- Weave each URL into the most relevant section (intro, body, or natural CTA); spread multiple links across the article.
- Use suggested anchor text as inline phrasing inside normal sentences, not as a bare URL or standalone line.
- Suggested anchor text is a hint only—prefer natural phrasing already in the article.
- Do NOT add sentences whose main purpose is to name a product/brand from the link list.
- If the source does not discuss a brand/product, do NOT invent a pitch line; place the link on an existing relevant phrase in a matching section.
- Do NOT add closing sentences whose only purpose is to hold a link.
- Do NOT put all links in the final paragraph or final three sentences.
- Do NOT add a "Related links" or link-dump section.
- Each listed URL must appear exactly once in contextually appropriate places throughout the article.`;

function rewriteAntiCopyBlock(min: number): string {
  if (min < 40) return "";
  return `
- Do not reuse any phrase of 5+ consecutive words from the source verbatim.`;
}

function rewriteTemperature(min: number): number {
  const m = Math.min(100, Math.max(0, min));
  if (m >= 50) return 0.55 + (m / 100) * 0.35;
  return 0.35 + (m / 100) * 0.35;
}

export type BuildArticleRewritePromptsOpts = {
  db: Db;
  organizationId: string;
  voice: Voice;
  sourceText: string;
  links: WriterLink[];
  writerArticleId?: string;
  rewriteDivergenceMin?: number;
  preserveInstructions?: boolean;
};

export function writerArticlesToExamples(articles: WriterArticle[]): ArticleRewriteExample[] {
  return articles.map((a) => ({
    title: a.title,
    html: writerArticleHtmlForLearning(a),
  }));
}

/** Test hook: reconstruction system prompt for the humanization engine. */
export function buildArticleRewritePrompts(opts: BuildArticleRewritePromptsOpts): {
  systemPrompt: string;
  userPrompt: string;
  sourceTruncated: boolean;
} {
  const ctx = resolveVoiceGenerationContext(opts.voice);
  const sourceTruncated = opts.sourceText.trim().length > env.maxWriterInputChars;
  const systemPrompt = buildReconstructionSystemPrompt({
    voice: opts.voice,
    ctx,
    facts: contentFactsSchema.parse({ keyDetails: ["Example fact for prompt testing."] }),
    interpretation: brandInterpretationSchema.parse({
      assessment: "Example assessment",
      qualityScore: 6,
      bestFor: "Example audience",
      risks: [],
      caveats: [],
      opportunities: [],
    }),
    examples: [],
    links: opts.links,
  });
  return {
    systemPrompt,
    userPrompt: "Facts-only reconstruction (no source draft text).",
    sourceTruncated,
  };
}

type LinkPipelineResult = {
  html: string;
  linksRevised: boolean;
  linksWoven: number;
  linksAppended: number;
  linksRedistributed: number;
};

async function expandArticleRewriteDivergence(opts: {
  sourceText: string;
  html: string;
  links: WriterLink[];
  targetMin: number;
  currentScore: number;
  expandAttempt: number;
}): Promise<string> {
  const maxChars = env.maxWriterInputChars;
  let sourceExcerpt = opts.sourceText.trim();
  if (sourceExcerpt.length > maxChars) {
    sourceExcerpt = `${sourceExcerpt.slice(0, maxChars)}\n\n[Source truncated for length.]`;
  }

  const escalatingRules =
    opts.expandAttempt >= 2
      ? `
- Change every paragraph opening; use new headings where appropriate.
- Do not reuse any full sentence from the source verbatim.`
      : "";

  const systemPrompt = `You rewrite an HTML article to be more distinct from the original source while preserving all facts.
Rules:
- Output an HTML fragment only (<p>, <h2>, <h3>, <a href="...">). No markdown. No <html>/<body>.
- Use new sentence structures and varied vocabulary; do not reuse phrases of 5+ consecutive words from the source.
- Keep every factual claim from the source.
- Each listed URL must appear exactly once as an inline anchor in the body.${rewriteAntiCopyBlock(opts.targetMin)}${escalatingRules}
${LINK_WEAVE_RULES}`;

  const userPrompt = [
    `The current rewrite scored ${opts.currentScore}% different from the source; target at least ${opts.targetMin}%.`,
    opts.expandAttempt >= 2
      ? "Rewrite aggressively: new paragraph openings, new headings, and no full sentences copied from the source."
      : "Rewrite with fresh phrasing and structure while keeping facts and all required links.",
    "",
    "Required links:",
    formatWriterLinksForPrompt(opts.links),
    "",
    "Original source:",
    sourceExcerpt,
    "",
    "Current HTML to improve:",
    opts.html.trim(),
  ].join("\n");

  const temperature = Math.min(
    EXPAND_TEMPERATURE_MAX,
    rewriteTemperature(opts.targetMin) + opts.expandAttempt * EXPAND_TEMPERATURE_STEP,
  );

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensWriter,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("article_rewrite_expand_empty");
  return raw;
}

export async function generateArticleRewriteHtml(opts: BuildArticleRewritePromptsOpts): Promise<{
  html: string;
  sourceTruncated: boolean;
  linksRequested: number;
  linksPresent: number;
  linksCarriedFromSource: number;
  linksAdded: number;
  linksNonRequestedInOutput: number;
  linksAppended: number;
  linksWoven: number;
  linksRedistributed: number;
  linksRevised: boolean;
  rewriteDivergenceScore: number;
  rewriteDivergenceMin: number;
  rewriteDivergenceBelowMin: boolean;
  rewriteDivergenceAttempts: number;
  factsExtracted: boolean;
  humanAuthenticityScore: number;
  brandConsistencyScore: number;
  genericityScore: number;
  humanizationAttempts: number;
}> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  if (opts.voice.persona_status !== "ready") {
    throw new Error("voice_persona_not_ready");
  }

  const divergenceMin = Math.min(100, Math.max(0, opts.rewriteDivergenceMin ?? 0));
  const humanized = await runHumanizationEngine({
    db: opts.db,
    voice: opts.voice,
    organizationId: opts.organizationId,
    sourceText: opts.sourceText,
    links: opts.links,
    writerArticleId: opts.writerArticleId,
    preserveInstructions: opts.preserveInstructions,
  });

  let pipeline = await applyWriterLinkPipeline(humanized.html, {
    sourceText: opts.sourceText,
    links: opts.links,
    voice: opts.voice,
  });
  let html = pipeline.html;
  const sourceTrimmed = opts.sourceText.trim();
  let rewriteDivergenceScore = writerRewriteDivergenceScore(sourceTrimmed, html);
  let rewriteDivergenceAttempts = 1;

  if (divergenceMin > 0 && rewriteDivergenceScore < divergenceMin) {
    let bestHtml = html;
    let bestScore = rewriteDivergenceScore;
    let bestPipeline = pipeline;
    let expandRetries = 0;

    while (bestScore < divergenceMin && expandRetries < MAX_EXPAND_RETRIES) {
      expandRetries++;
      const expanded = await expandArticleRewriteDivergence({
        sourceText: sourceTrimmed,
        html: bestHtml,
        links: opts.links,
        targetMin: divergenceMin,
        currentScore: bestScore,
        expandAttempt: expandRetries,
      });
      const retryPipeline = await applyWriterLinkPipeline(expanded, {
        sourceText: opts.sourceText,
        links: opts.links,
        voice: opts.voice,
      });
      const retryScore = writerRewriteDivergenceScore(sourceTrimmed, retryPipeline.html);
      rewriteDivergenceAttempts++;
      if (retryScore > bestScore) {
        bestHtml = retryPipeline.html;
        bestScore = retryScore;
        bestPipeline = retryPipeline;
      }
    }

    html = bestHtml;
    rewriteDivergenceScore = bestScore;
    pipeline = bestPipeline;
  }

  const rewriteDivergenceBelowMin =
    divergenceMin > 0 && rewriteDivergenceScore < divergenceMin;

  const primaryStyle = await loadPrimaryStyleExampleForTransfer(
    opts.db,
    opts.organizationId,
    opts.voice,
  );
  if (shouldRunStyleTransfer(primaryStyle?.html)) {
    html = await runStyleTransferPass({
      voice: opts.voice,
      html,
      referenceHtml: primaryStyle!.html,
      referenceTitle: primaryStyle!.title,
      composeStyleKit: primaryStyle!.composeStyleKit,
      links: opts.links,
      composeMode: false,
    });
  }

  return {
    html,
    sourceTruncated: humanized.sourceTruncated,
    linksRequested: opts.links.length,
    linksPresent: writerLinksPresentCount(html, opts.links),
    linksCarriedFromSource: writerRequestedLinksCarriedFromSource(sourceTrimmed, html, opts.links),
    linksAdded: writerRequestedLinksAdded(sourceTrimmed, html, opts.links),
    linksNonRequestedInOutput: writerNonRequestedLinksInHtml(html, opts.links),
    linksAppended: pipeline.linksAppended,
    linksWoven: pipeline.linksWoven,
    linksRedistributed: pipeline.linksRedistributed,
    linksRevised: pipeline.linksRevised,
    rewriteDivergenceScore,
    rewriteDivergenceMin: divergenceMin,
    rewriteDivergenceBelowMin,
    rewriteDivergenceAttempts,
    factsExtracted: humanized.factsExtracted,
    humanAuthenticityScore: humanized.humanAuthenticityScore,
    brandConsistencyScore: humanized.brandConsistencyScore,
    genericityScore: humanized.genericityScore,
    humanizationAttempts: humanized.humanizationAttempts,
  };
}
