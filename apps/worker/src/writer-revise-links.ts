import { formatWriterLinksForPrompt, type Voice, type WriterLink } from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "./env.js";

export type ReviseWriterLinksOpts = {
  html: string;
  links: WriterLink[];
  voice: Voice;
};

const REVISE_SYSTEM = `You revise an existing HTML article fragment to integrate external links naturally.
Rules:
- Output an HTML fragment only (<p>, <h2>, <h3>, <ul>, <li>, <a href="...">). No markdown. No <html>/<body>.
- Keep factual claims and overall structure; do not invent new offers, stats, or quotes.
- Weave each required URL into the most relevant existing paragraph or section using natural inline anchor text.
- Spread links across the article body when there are multiple URLs.
- Do NOT add sentences whose only purpose is to hold a link.
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

  const userPrompt = [
    "Revise the HTML below so the listed links are integrated naturally in the body.",
    "",
    "Required links:",
    formatWriterLinksForPrompt(opts.links),
    "",
    voiceHint,
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
