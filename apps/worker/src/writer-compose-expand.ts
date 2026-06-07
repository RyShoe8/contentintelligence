import {
  formatWriterLinksForPrompt,
  stripHtmlToPlainText,
  type WriterLink,
} from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "./env.js";

export function writerHtmlWordCount(html: string): number {
  return stripHtmlToPlainText(html).split(/\s+/).filter(Boolean).length;
}

export async function expandArticleComposeDepth(opts: {
  html: string;
  researchBrief: string;
  links: WriterLink[];
  minWords: number;
  maxWords: number;
  subtopics?: string[];
  topic?: string;
}): Promise<string> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  const maxChars = env.maxWriterInputChars;
  let briefExcerpt = opts.researchBrief.trim();
  if (briefExcerpt.length > maxChars) {
    briefExcerpt = `${briefExcerpt.slice(0, maxChars)}\n\n[Research brief truncated for length.]`;
  }

  const subtopicsBlock = opts.subtopics?.length
    ? `\nRequired subtopics (ensure each has a dedicated section):\n${opts.subtopics.map((s) => `- ${s}`).join("\n")}`
    : "";

  const topicBlock = opts.topic?.trim()
    ? `\nArticle subject: ${opts.topic.trim()}. Expand topic depth (examples, jurisdiction nuance, FAQ answers) — not brand/community sections.`
    : "";

  const systemPrompt = `You expand an HTML article to meet a target word count while preserving facts and links.
Rules:
- Output an HTML fragment only (<p>, <h2>, <h3>, <ul>, <li>, <ol>, <a href="...">). No markdown. No <html>/<body>.
- Keep every factual claim and every existing <a href> URL unchanged.
- Add depth: new H2/H3 sections, examples, nuance, caveats, and practical detail drawn from the research brief.
- Target ${opts.minWords}–${opts.maxWords} words total.
- When required anchor text is listed for a link, use that exact phrase as the link text.
- Do NOT add a "Related links" section.${topicBlock}${subtopicsBlock}`;

  const userPrompt = [
    `Current word count is below target (${opts.minWords}–${opts.maxWords} words). Expand the article.`,
    "",
    opts.links.length
      ? `Required links:\n${formatWriterLinksForPrompt(opts.links, { exactAnchorLabels: true })}`
      : "",
    "",
    "Research brief (source of facts):",
    briefExcerpt,
    "",
    "Current HTML to expand:",
    opts.html.trim(),
  ]
    .filter(Boolean)
    .join("\n");

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
  if (!raw) throw new Error("article_compose_expand_empty");
  return raw;
}
