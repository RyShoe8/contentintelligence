import { formatWriterLinksForPrompt, type Voice, type WriterLink } from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "./env.js";

const REVISE_SOURCE_MAX_CHARS = 12_000;

export type ReviseWriterLinksOpts = {
  html: string;
  links: WriterLink[];
  voice: Voice;
  sourceText: string;
};

const REVISE_SYSTEM = `You revise an existing HTML article fragment to integrate external links naturally.
Rules:
- Output an HTML fragment only (<p>, <h2>, <h3>, <ul>, <li>, <a href="...">). No markdown. No <html>/<body>.
- Keep factual claims and overall structure; do not invent new offers, stats, or quotes.
- Weave each required URL into paragraphs that already discuss related ideas in the current HTML or original source.
- Spread links across the article body when there are multiple URLs.
- Suggested anchor text is a hint only—prefer natural phrasing already in the article.
- Do NOT add sentences whose main purpose is to name a product/brand from the link list.
- If the source does not discuss a brand/product, do NOT invent a pitch line; link an existing relevant phrase instead.
- Do NOT add sentences whose only purpose is to hold a link; remove link-only promotional one-liners.
- Do NOT cluster all links in the final paragraph or final three sentences.
- Do NOT add a "Related links" or link-dump section.
- Each listed URL must appear exactly once.
- Do NOT add URLs that were not listed.`;

export async function reviseWriterLinksInHtml(opts: ReviseWriterLinksOpts): Promise<string> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }
  if (!opts.links.length) return opts.html;

  const voiceHint = opts.voice.persona?.trim()
    ? `Match this voice tone:\n${opts.voice.persona.trim().slice(0, 800)}`
    : `Match the voice named "${opts.voice.name}".`;

  let sourceExcerpt = opts.sourceText.trim();
  if (sourceExcerpt.length > REVISE_SOURCE_MAX_CHARS) {
    sourceExcerpt = `${sourceExcerpt.slice(0, REVISE_SOURCE_MAX_CHARS)}\n\n[Source truncated for length.]`;
  }

  const userPrompt = [
    "Revise the HTML below so the listed links are integrated naturally in the body.",
    "Redistribute links into sections that already match each URL topic; remove sentences added only to hold a link.",
    "",
    "Required links:",
    formatWriterLinksForPrompt(opts.links),
    "",
    voiceHint,
    "",
    "Original source (for topic alignment only; do not copy verbatim):",
    sourceExcerpt,
    "",
    "Current HTML:",
    opts.html.trim(),
  ].join("\n");

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensWriter,
    temperature: 0.35,
    messages: [
      { role: "system", content: REVISE_SYSTEM },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("article_link_revise_empty");
  return raw;
}
