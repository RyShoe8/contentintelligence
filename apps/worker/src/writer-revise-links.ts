import { formatWriterLinksForPrompt, type Voice, type WriterLink } from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "./env.js";
import { writerModel } from "./services/llm/model-registry.js";

const REVISE_SOURCE_MAX_CHARS = 12_000;

export type ReviseWriterLinksOpts = {
  html: string;
  links: WriterLink[];
  voice: Voice;
  sourceText: string;
  exactAnchorLabels?: boolean;
  composeMode?: boolean;
};

const REVISE_SYSTEM = `You revise an existing HTML article fragment to integrate external links naturally.
Rules:
- Output an HTML fragment only (<p>, <h2>, <h3>, <ul>, <li>, <a href="...">). No markdown. No <html>/<body>.
- Keep factual claims and overall structure; do not invent new offers, stats, or quotes.
- Weave each required URL into paragraphs that already discuss related ideas in the current HTML or original source.
- Spread links across the article body when there are multiple URLs.
- When preferred anchor text is listed, use it as link text only when it fits naturally in the sentence; otherwise link the closest natural phrase already in the paragraph.
- Do NOT add sentences whose main purpose is to name a product/brand from the link list.
- If the source does not discuss a brand/product, do NOT invent a pitch line; link an existing relevant phrase instead.
- Do NOT add sentences whose only purpose is to hold a link; remove link-only promotional one-liners.
- Do NOT cluster all links in the final paragraph or final three sentences.
- Do NOT add a "Related links" or link-dump section.
- Never use parenthetical link stubs like (anchor text) or trailing See anchor patterns — rewrite them into inline sentence grammar.
- Each listed URL must appear exactly once.
- Do NOT add URLs that were not listed.`;

const REVISE_COMPOSE_EXTRA = `
Compose link integration (strict):
- If preferred anchor text is not in the article, rewrite an existing sentence in a relevant section to include a natural inline link — do not add a standalone promo line.
- Never place links only in the closing paragraph.
- Remove any Related links section; weave every URL into body paragraphs.`;

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
    formatWriterLinksForPrompt(opts.links, {
      exactAnchorLabels: opts.exactAnchorLabels,
    }),
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
  const systemContent = opts.composeMode
    ? `${REVISE_SYSTEM}${REVISE_COMPOSE_EXTRA}`
    : REVISE_SYSTEM;
  const res = await client.chat.completions.create({
    model: writerModel(),
    max_tokens: env.maxTokensWriter,
    temperature: 0.35,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("article_link_revise_empty");
  return raw;
}
