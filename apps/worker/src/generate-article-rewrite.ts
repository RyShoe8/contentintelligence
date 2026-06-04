import {
  ensureWriterLinksInHtml,
  type GenerationConstraints,
  type Voice,
  type WriterLink,
  writerLinksMissingFromHtml,
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

const EXAMPLE_EXCERPT_CHARS = 1500;

export type ArticleRewriteExample = {
  title: string;
  html: string;
};

export type BuildArticleRewritePromptsOpts = {
  voice: Voice;
  sourceText: string;
  links: WriterLink[];
  examples: ArticleRewriteExample[];
};

export type ArticleRewritePrompts = {
  systemPrompt: string;
  userPrompt: string;
  sourceTruncated: boolean;
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
- Every provided link URL must appear at least once as an <a href="URL">…</a> with natural anchor text (use the suggested label when provided).
- Do NOT add URLs that were not provided.
- Respect taboos; avoid generic affiliate hype and fake urgency.
${archetypeLine ?? ""}${styleRulesBlock(style)}${sharedIdentityBlock(constraints)}${personaBlock}

Brand generation constraints (JSON):
${formatConstraintsForPrompt(constraints)}`;
}

function buildPersonaArticleSystemPrompt(persona: string, style: VoiceStylePromptOpts): string {
  return `Rewrite the user's source article as a full blog article in HTML using the brand voice persona below.
Rules:
- Preserve factual claims from the source; do not invent statistics, quotes, or offers.
- Match the persona's tone, vocabulary, and rhythm throughout.
- Use clear structure with HTML headings and paragraphs where appropriate.
- Output an HTML fragment only (<p>, <h2>, <h3>, lists, <a href="...">). No <html>/<body>. No markdown.
- Every provided link URL must appear at least once as <a href="URL">…</a> with natural anchor text.
- Do NOT add URLs that were not provided.${styleRulesBlock(style)}

Brand voice persona:
${persona.trim()}`;
}

function buildDefaultArticleSystemPrompt(style: VoiceStylePromptOpts): string {
  return `Rewrite the user's source article as a polished blog article in HTML.
Rules:
- Preserve factual claims from the source.
- Informative, engaging promotional/editorial tone.
- HTML fragment only (<p>, <h2>, <h3>, <a href="...">). No markdown. No <html>/<body>.
- Use every provided link at least once as <a href="URL">…</a>. Do not invent URLs.${styleRulesBlock(style)}`;
}

function formatLinksForPrompt(links: WriterLink[]): string {
  if (!links.length) return "(none — do not add external links)";
  return links
    .map((l, i) => {
      const label = l.label?.trim();
      return `${i + 1}. URL: ${l.url}${label ? ` — suggested anchor: ${label}` : ""}`;
    })
    .join("\n");
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

  let systemPrompt: string;
  if (ctx.constraints) {
    systemPrompt = buildConstraintArticleSystemPrompt(ctx.constraints, style, ctx.persona);
  } else if (ctx.persona?.trim()) {
    systemPrompt = buildPersonaArticleSystemPrompt(ctx.persona, style);
  } else {
    systemPrompt = buildDefaultArticleSystemPrompt(style);
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
      ? `REQUIRED: Include exactly ${opts.links.length} distinct <a href="..."> tags — one per listed URL. Do not skip any.`
      : null;

  const userParts = [
    "Source article to rewrite:",
    sourceText,
    "",
    "Links to weave in (required when listed):",
    formatLinksForPrompt(opts.links),
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

export async function generateArticleRewriteHtml(opts: BuildArticleRewritePromptsOpts): Promise<{
  html: string;
  sourceTruncated: boolean;
  linksRequested: number;
  linksAppended: number;
}> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  if (opts.voice.persona_status !== "ready") {
    throw new Error("voice_persona_not_ready");
  }

  const { systemPrompt, userPrompt, sourceTruncated } = buildArticleRewritePrompts(opts);
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensWriter,
    temperature: 0.45,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("article_rewrite_empty");

  const missingBefore = writerLinksMissingFromHtml(raw, opts.links);
  const html = ensureWriterLinksInHtml(raw, opts.links);

  return {
    html,
    sourceTruncated,
    linksRequested: opts.links.length,
    linksAppended: missingBefore.length,
  };
}
