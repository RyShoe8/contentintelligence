import {
  finalizeWriterLinksInHtml,
  formatWriterLinksForPrompt,
  type GenerationConstraints,
  type Voice,
  type WriterLink,
  writerLinksNeedRevision,
  writerLinksPresentCount,
  writerNonRequestedLinksInHtml,
  writerRequestedLinksAdded,
  writerRequestedLinksCarriedFromSource,
  writerRewriteDivergenceScore,
} from "@content-resourcer/db";
import { writerArticleHtmlForLearning, type WriterArticle } from "@content-resourcer/db";
import OpenAI from "openai";
import { formatConstraintsForPrompt } from "./services/constraints/assemble-generation-constraints.js";
import { env } from "./env.js";
import { resolveVoiceGenerationContext } from "./voice-generation-context.js";
import {
  buildVoiceStylePromptLines,
  formatPreferredPhrasesForUserMessage,
  type VoiceStylePromptOpts,
} from "./voice-style-rules.js";
import { reviseWriterLinksInHtml } from "./writer-revise-links.js";

const EXAMPLE_EXCERPT_CHARS = 1500;
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

function rewriteIntensityBlock(min: number): string {
  if (min <= 20) {
    return `
Rewrite intensity (target ~${min}% difference from source wording):
- Light polish: keep section order and most sentences; change voice and tone.`;
  }
  if (min <= 49) {
    return `
Rewrite intensity (target ~${min}% difference from source wording):
- Moderate rewrite: rephrase paragraphs and adjust headings; keep the same facts.`;
  }
  if (min <= 80) {
    return `
Rewrite intensity (target ~${min}% difference from source wording):
- Substantial rewrite: new structure and flow; fresh phrasing throughout; same facts.`;
  }
  return `
Rewrite intensity (target ~${min}% difference from source wording):
- Heavy rewrite: new outline and fresh phrasing throughout; same facts.`;
}

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

export type ArticleRewriteExample = {
  title: string;
  html: string;
};

export type BuildArticleRewritePromptsOpts = {
  voice: Voice;
  sourceText: string;
  links: WriterLink[];
  examples: ArticleRewriteExample[];
  rewriteDivergenceMin?: number;
};

export type ArticleRewritePrompts = {
  systemPrompt: string;
  userPrompt: string;
  sourceTruncated: boolean;
};

type LinkPipelineResult = {
  html: string;
  linksRevised: boolean;
  linksWoven: number;
  linksAppended: number;
};

function styleRulesBlock(style: VoiceStylePromptOpts): string {
  const lines = buildVoiceStylePromptLines(style);
  return lines.length ? `\n${lines.join("\n")}` : "";
}

function sharedIdentityBlock(constraints: GenerationConstraints): string {
  const s = constraints.sharedIdentity;
  if (!s) return "";
  const lines = [
    "",
    "Shared identity (copy must align):",
    s.audienceType ? `- Audience: ${s.audienceType}` : null,
    s.internetCultureAlignment ? `- Culture: ${s.internetCultureAlignment}` : null,
    s.energyProfile ? `- Energy: ${s.energyProfile}` : null,
    s.trustStyle ? `- Trust: ${s.trustStyle}` : null,
    s.sophisticationLevel ? `- Sophistication: ${s.sophisticationLevel}` : null,
  ].filter((x): x is string => Boolean(x));
  return lines.length ? lines.join("\n") : "";
}

function buildConstraintArticleSystemPrompt(
  constraints: GenerationConstraints,
  style: VoiceStylePromptOpts,
  persona?: string,
  divergenceMin = 0,
): string {
  const archetypeLine = constraints.archetype
    ? `- Embody archetype: ${constraints.archetype}`
    : null;
  const personaBlock = persona?.trim()
    ? `\nBrand voice persona:\n${persona.trim()}`
    : "";
  return `Rewrite the user's source article as a full blog article in HTML using the structured brand constraints below.
Rules:
- Preserve factual claims from the source; do not invent statistics, quotes, or offers.
- Match the voice's tone, vocabulary, and rhythm throughout (not a short social post).
- Use clear structure with HTML headings (<h2>, <h3>) and paragraphs (<p>) where appropriate.
- Output an HTML fragment only: use <p>, <h2>, <h3>, <ul>, <li>, and <a href="..."> for links.
- Do NOT wrap in <html>, <head>, or <body>. Do NOT use markdown.
- Do NOT add URLs that were not provided.
- Respect taboos; avoid generic affiliate hype and fake urgency.${rewriteAntiCopyBlock(divergenceMin)}
${LINK_WEAVE_RULES}
${archetypeLine ?? ""}${styleRulesBlock(style)}${sharedIdentityBlock(constraints)}${personaBlock}

Brand generation constraints (JSON):
${formatConstraintsForPrompt(constraints)}`;
}

function buildPersonaArticleSystemPrompt(
  persona: string,
  style: VoiceStylePromptOpts,
  divergenceMin = 0,
): string {
  return `Rewrite the user's source article as a full blog article in HTML using the brand voice persona below.
Rules:
- Preserve factual claims from the source; do not invent statistics, quotes, or offers.
- Match the persona's tone, vocabulary, and rhythm throughout.
- Use clear structure with HTML headings and paragraphs where appropriate.
- Output an HTML fragment only (<p>, <h2>, <h3>, lists, <a href="...">). No <html>/<body>. No markdown.
- Do NOT add URLs that were not provided.${rewriteAntiCopyBlock(divergenceMin)}
${LINK_WEAVE_RULES}${styleRulesBlock(style)}

Brand voice persona:
${persona.trim()}`;
}

function buildDefaultArticleSystemPrompt(style: VoiceStylePromptOpts, divergenceMin = 0): string {
  return `Rewrite the user's source article as a polished blog article in HTML.
Rules:
- Preserve factual claims from the source.
- Informative, engaging promotional/editorial tone.
- HTML fragment only (<p>, <h2>, <h3>, <a href="...">). No markdown. No <html>/<body>.
- Do not invent URLs.${rewriteAntiCopyBlock(divergenceMin)}
${LINK_WEAVE_RULES}${styleRulesBlock(style)}`;
}

function formatExamplesForPrompt(examples: ArticleRewriteExample[]): string {
  if (!examples.length) return "";
  const blocks = examples.map((ex, i) => {
    const html =
      ex.html.length > EXAMPLE_EXCERPT_CHARS
        ? `${ex.html.slice(0, EXAMPLE_EXCERPT_CHARS)}…`
        : ex.html;
    return `### Example ${i + 1}: ${ex.title}\n${html}`;
  });
  return `\n\nPublished examples in this voice (match style and formatting, not content):\n${blocks.join("\n\n")}`;
}

export function writerArticlesToExamples(articles: WriterArticle[]): ArticleRewriteExample[] {
  return articles.map((a) => ({
    title: a.title,
    html: writerArticleHtmlForLearning(a),
  }));
}

export function buildArticleRewritePrompts(opts: BuildArticleRewritePromptsOpts): ArticleRewritePrompts {
  const ctx = resolveVoiceGenerationContext(opts.voice);
  const style: VoiceStylePromptOpts = {
    brandName: ctx.brandName,
    brandMentionLevel: ctx.brandMentionLevel,
    contentProviderName: undefined,
    sourcesInPostsLevel: ctx.sourcesInPostsLevel,
    preferredPhrases: ctx.preferredPhrases,
  };

  const divergenceMin = Math.min(100, Math.max(0, opts.rewriteDivergenceMin ?? 0));

  let systemPrompt: string;
  if (ctx.constraints) {
    systemPrompt = buildConstraintArticleSystemPrompt(ctx.constraints, style, ctx.persona, divergenceMin);
  } else if (ctx.persona?.trim()) {
    systemPrompt = buildPersonaArticleSystemPrompt(ctx.persona, style, divergenceMin);
  } else {
    systemPrompt = buildDefaultArticleSystemPrompt(style, divergenceMin);
  }

  if (divergenceMin > 0) {
    systemPrompt += rewriteIntensityBlock(divergenceMin);
  }

  const maxChars = env.maxWriterInputChars;
  let sourceText = opts.sourceText.trim();
  let sourceTruncated = false;
  if (sourceText.length > maxChars) {
    sourceText = `${sourceText.slice(0, maxChars)}\n\n[Source truncated for length.]`;
    sourceTruncated = true;
  }

  const linkRequirement =
    opts.links.length > 0
      ? "Each listed URL must appear exactly once, woven into contextually appropriate places throughout the article (not clustered at the end)."
      : null;

  const userParts = [
    "Source article to rewrite:",
    sourceText,
    divergenceMin > 0
      ? `Rewrite so the wording is noticeably different from the source (target at least ~${divergenceMin}% change in phrasing while keeping facts).`
      : null,
    "",
    "Links to weave in (required when listed):",
    formatWriterLinksForPrompt(opts.links),
    linkRequirement,
    ctx.preferredPhrases?.length
      ? formatPreferredPhrasesForUserMessage(ctx.preferredPhrases)
      : null,
    formatExamplesForPrompt(opts.examples) || null,
  ].filter(Boolean);

  return {
    systemPrompt,
    userPrompt: userParts.join("\n"),
    sourceTruncated,
  };
}

async function applyWriterLinkPipeline(
  html: string,
  opts: BuildArticleRewritePromptsOpts,
): Promise<LinkPipelineResult> {
  let out = html;
  let linksRevised = false;
  let linksWoven = 0;
  let linksAppended = 0;

  if (
    opts.links.length > 0 &&
    writerLinksNeedRevision(out, opts.links, opts.sourceText.trim())
  ) {
    out = await reviseWriterLinksInHtml({
      html: out,
      links: opts.links,
      voice: opts.voice,
      sourceText: opts.sourceText.trim(),
    });
    linksRevised = true;
  }

  const finalized = finalizeWriterLinksInHtml(out, opts.links);
  out = finalized.html;
  linksWoven += finalized.linksWoven;
  linksAppended += finalized.linksAppended;

  return { html: out, linksRevised, linksWoven, linksAppended };
}

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
  linksRevised: boolean;
  rewriteDivergenceScore: number;
  rewriteDivergenceMin: number;
  rewriteDivergenceBelowMin: boolean;
  rewriteDivergenceAttempts: number;
}> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  if (opts.voice.persona_status !== "ready") {
    throw new Error("voice_persona_not_ready");
  }

  const divergenceMin = Math.min(100, Math.max(0, opts.rewriteDivergenceMin ?? 0));
  const { systemPrompt, userPrompt, sourceTruncated } = buildArticleRewritePrompts(opts);
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensWriter,
    temperature: rewriteTemperature(divergenceMin),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("article_rewrite_empty");

  let pipeline = await applyWriterLinkPipeline(raw, opts);
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
      const retryPipeline = await applyWriterLinkPipeline(expanded, opts);
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

  return {
    html,
    sourceTruncated,
    linksRequested: opts.links.length,
    linksPresent: writerLinksPresentCount(html, opts.links),
    linksCarriedFromSource: writerRequestedLinksCarriedFromSource(sourceTrimmed, html, opts.links),
    linksAdded: writerRequestedLinksAdded(sourceTrimmed, html, opts.links),
    linksNonRequestedInOutput: writerNonRequestedLinksInHtml(html, opts.links),
    linksAppended: pipeline.linksAppended,
    linksWoven: pipeline.linksWoven,
    linksRevised: pipeline.linksRevised,
    rewriteDivergenceScore,
    rewriteDivergenceMin: divergenceMin,
    rewriteDivergenceBelowMin,
    rewriteDivergenceAttempts,
  };
}
