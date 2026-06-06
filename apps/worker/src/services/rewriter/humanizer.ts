import { rewriterBlacklistPromptBlock } from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "../../env.js";
import { resolveVoiceGenerationContext } from "../../voice-generation-context.js";
import { buildVoiceStylePromptLines, type VoiceStylePromptOpts } from "../../voice-style-rules.js";

export type HumanizeArticleOpts = {
  voice: Voice;
  html: string;
  retryIssues?: string[];
  attempt?: number;
};

export async function humanizeArticleHtml(opts: HumanizeArticleOpts): Promise<string> {
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

  const systemPrompt = `Humanize an HTML article fragment. Remove remaining AI fingerprints while preserving facts, links, and brand voice.
Rules:
- Output HTML fragment only. No markdown.
- Vary sentence length and rhythm; reduce hype and robotic transitions.
- Remove marketing clichés and affiliate spam tone.
- Do not use:
${rewriterBlacklistPromptBlock()}
- Keep every factual claim and every existing <a href> URL unchanged.
${styleLines.length ? `\n${styleLines.join("\n")}` : ""}${retryBlock}`;

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensWriter,
    temperature: 0.5,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: opts.html.trim() },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("article_humanize_empty");
  return raw;
}
