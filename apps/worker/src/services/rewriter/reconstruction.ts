import {
  formatWriterLinksForPrompt,
  rewriterBlacklistPromptBlock,
  type BrandInterpretation,
  type BrandMemory,
  type ContentFacts,
  type WriterLink,
} from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import OpenAI from "openai";
import { formatConstraintsForPrompt } from "../constraints/assemble-generation-constraints.js";
import { env } from "../../env.js";
import type { VoiceGenerationContext } from "../../voice-generation-context.js";
import {
  buildVoiceStylePromptLines,
  type VoiceStylePromptOpts,
} from "../../voice-style-rules.js";
import type { ArticleRewriteExample } from "./types.js";

const EXAMPLE_EXCERPT_CHARS = 1500;

function fingerprintsBlock(memory?: BrandMemory): string {
  if (!memory) return "";
  const parts: string[] = [];
  if (memory.favoriteOpenings?.length) {
    parts.push(`Openings this brand uses: ${memory.favoriteOpenings.slice(0, 5).join(" | ")}`);
  }
  if (memory.favoriteClosings?.length) {
    parts.push(`Closings this brand uses: ${memory.favoriteClosings.slice(0, 5).join(" | ")}`);
  }
  if (memory.favoriteTransitions?.length) {
    parts.push(`Transitions: ${memory.favoriteTransitions.slice(0, 5).join(" | ")}`);
  }
  if (memory.recurringOpinions?.length) {
    parts.push(`Recurring opinions: ${memory.recurringOpinions.slice(0, 5).join(" | ")}`);
  }
  if (memory.recurringWarnings?.length) {
    parts.push(`Recurring warnings: ${memory.recurringWarnings.slice(0, 5).join(" | ")}`);
  }
  return parts.length ? `\nHuman fingerprints (use naturally when they fit):\n${parts.join("\n")}` : "";
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
  return `\n\nBrand examples (match voice and rhythm, not content):\n${blocks.join("\n\n")}`;
}

export type ReconstructArticleOpts = {
  voice: Voice;
  ctx: VoiceGenerationContext;
  facts: ContentFacts;
  interpretation: BrandInterpretation;
  examples: ArticleRewriteExample[];
  links: WriterLink[];
  retryIssues?: string[];
  attempt?: number;
};

export function buildReconstructionSystemPrompt(opts: ReconstructArticleOpts): string {
  const style: VoiceStylePromptOpts = {
    brandName: opts.ctx.brandName,
    brandMentionLevel: opts.ctx.brandMentionLevel,
    contentProviderName: undefined,
    sourcesInPostsLevel: opts.ctx.sourcesInPostsLevel,
    preferredPhrases: opts.ctx.preferredPhrases,
  };
  const styleLines = buildVoiceStylePromptLines(style);
  const personaBlock = opts.ctx.persona?.trim()
    ? `\nBrand persona:\n${opts.ctx.persona.trim()}`
    : "";
  const constraintsBlock = opts.ctx.constraints
    ? `\nBrand constraints (JSON):\n${formatConstraintsForPrompt(opts.ctx.constraints)}`
    : "";
  const memory = opts.voice.brand_profile?.memory;

  return `Write a full blog article in HTML from structured facts and brand interpretation.
Rules:
- Do NOT rewrite any original draft text. You never saw the original wording.
- Use ONLY extracted facts and brand interpretation below.
- Include the brand's viewpoint and caveats where relevant.
- Output an HTML fragment only (<p>, <h2>, <h3>, <ul>, <li>, <a href="...">). No markdown. No <html>/<body>.
- Do not invent statistics, quotes, or offers not in the facts.
- Avoid generic AI and affiliate marketing language.
- Do not use these phrases:
${rewriterBlacklistPromptBlock()}
${styleLines.length ? `\n${styleLines.join("\n")}` : ""}${personaBlock}${constraintsBlock}${fingerprintsBlock(memory)}`;
}

export async function reconstructArticleHtml(opts: ReconstructArticleOpts): Promise<string> {
  if (!env.openaiApiKey) throw new Error("openai_not_configured");

  const linkBlock =
    opts.links.length > 0
      ? `\nLinks to weave in (required when listed):\n${formatWriterLinksForPrompt(opts.links)}\nEach URL exactly once, spread across the body.`
      : "";

  const retryBlock =
    opts.retryIssues?.length && (opts.attempt ?? 0) > 1
      ? `\nFix these issues from the prior attempt:\n${opts.retryIssues.map((i) => `- ${i}`).join("\n")}`
      : "";

  const userPrompt = [
    "Extracted facts (JSON):",
    JSON.stringify(opts.facts, null, 2),
    "",
    "Brand interpretation (JSON):",
    JSON.stringify(opts.interpretation, null, 2),
    formatExamplesForPrompt(opts.examples),
    linkBlock,
    retryBlock,
    "",
    "Write the article now.",
  ]
    .filter(Boolean)
    .join("\n");

  const temperature = Math.min(0.85, 0.45 + ((opts.attempt ?? 1) - 1) * 0.12);
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensWriter,
    temperature,
    messages: [
      { role: "system", content: buildReconstructionSystemPrompt(opts) },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("article_reconstruction_empty");
  return raw;
}
