import { rewriterBlacklistPromptBlock } from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "../../env.js";
import { resolveVoiceGenerationContext } from "../../voice-generation-context.js";
import { buildVoiceStylePromptLines, type VoiceStylePromptOpts } from "../../voice-style-rules.js";
import {
  COMPOSE_SBD_RHETORIC_RULES,
  COMPOSE_VOICE_RULES,
  composeFaqPromptRules,
} from "./compose-voice-rules.js";

const COMPOSE_STYLE_EXCERPT_CHARS = 2800;

export type HumanizeArticleOpts = {
  voice: Voice;
  html: string;
  retryIssues?: string[];
  attempt?: number;
  skip?: boolean;
  proceduralLock?: boolean;
  composeMode?: boolean;
  topic?: string;
  styleExampleExcerpt?: string;
  includeFaq?: boolean;
};

export async function humanizeArticleHtml(opts: HumanizeArticleOpts): Promise<string> {
  if (opts.skip) return opts.html;
  if (!env.openaiApiKey) throw new Error("openai_not_configured");

  const ctx = resolveVoiceGenerationContext(opts.voice);
  const style: VoiceStylePromptOpts = {
    brandName: ctx.brandName,
    brandMentionLevel: ctx.brandMentionLevel,
    contentProviderName: undefined,
    sourcesInPostsLevel: ctx.sourcesInPostsLevel,
    preferredPhrases: ctx.preferredPhrases,
  };
  const styleLines = buildVoiceStylePromptLines(style);

  const retryBlock =
    opts.retryIssues?.length && (opts.attempt ?? 0) > 1
      ? `\nAddress these issues:\n${opts.retryIssues.map((i) => `- ${i}`).join("\n")}`
      : "";

  const proceduralLockBlock = opts.proceduralLock
    ? `
- Do NOT remove, merge, or shorten steps under procedural how-to headings.
- Preserve every <ol><li> step list under procedural section headings verbatim in meaning and order.
- You may polish narrative paragraphs and lists outside procedural step blocks.`
    : "";

  const composeFaqBlock = opts.composeMode ? composeFaqPromptRules(opts.includeFaq) : "";

  const composeTopicBlock =
    opts.composeMode && opts.topic?.trim()
      ? `\n- Preserve topic focus on "${opts.topic.trim()}"; do not introduce brand-as-subject or meta community sections.${COMPOSE_VOICE_RULES}${COMPOSE_SBD_RHETORIC_RULES}${composeFaqBlock}`
      : "";

  const systemPrompt = `Humanize an HTML article fragment. Remove remaining AI fingerprints while preserving facts, links, and brand voice.
Rules:
- Output HTML fragment only. No markdown.
- Vary sentence length and rhythm; reduce hype and robotic transitions.
- Remove marketing clichés and affiliate spam tone.
- Do not use:
${rewriterBlacklistPromptBlock()}
- Keep every factual claim and every existing <a href> URL unchanged.${proceduralLockBlock}${composeTopicBlock}
${styleLines.length ? `\n${styleLines.join("\n")}` : ""}${retryBlock}`;

  const styleExampleBlock =
    opts.composeMode && opts.styleExampleExcerpt?.trim()
      ? `\n\nBrand style reference (match rhythm and paragraph length only — do not copy titles, dates, navigation, or share buttons):\n${opts.styleExampleExcerpt.trim().slice(0, COMPOSE_STYLE_EXCERPT_CHARS)}`
      : "";

  const systemPromptWithStyle = `${systemPrompt}${styleExampleBlock}`;

  const userContent = opts.html.trim();

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensWriter,
    temperature: 0.5,
    messages: [
      { role: "system", content: systemPromptWithStyle },
      { role: "user", content: userContent },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("article_humanize_empty");
  return raw;
}
