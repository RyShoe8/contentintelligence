import {
  formatWriterLinksForPrompt,
  stripHtmlToPlainText,
  type ContentFacts,
  type WriterLink,
} from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "./env.js";
import {
  COMPOSE_EXPAND_FORBIDDEN_PATTERNS,
  COMPOSE_SBD_RHETORIC_RULES,
  COMPOSE_VOICE_RULES,
  composeFaqPromptRules,
} from "./services/rewriter/compose-voice-rules.js";

export function writerHtmlWordCount(html: string): number {
  return stripHtmlToPlainText(html).split(/\s+/).filter(Boolean).length;
}

export type ExpandArticleComposePromptOpts = {
  facts: ContentFacts;
  links: WriterLink[];
  minWords: number;
  maxWords: number;
  subtopics?: string[];
  topic?: string;
  includeFaq?: boolean;
  currentHtml: string;
};

export function buildExpandArticleComposeSystemPrompt(opts: {
  minWords: number;
  maxWords: number;
  subtopics?: string[];
  topic?: string;
  includeFaq?: boolean;
}): string {
  const subtopicsBlock = opts.subtopics?.length
    ? `\nRequired subtopics (ensure each has a dedicated section):\n${opts.subtopics.map((s) => `- ${s}`).join("\n")}`
    : "";

  const topicBlock = opts.topic?.trim()
    ? `\nArticle subject: ${opts.topic.trim()}. Expand topic depth with editorial conviction — not brand/community sections or neutral industry survey.`
    : "";

  return `You expand an HTML article to meet a target word count while preserving facts, links, and brand editorial voice.
Rules:
- Output an HTML fragment only (<p>, <h2>, <h3>, <ul>, <li>, <ol>, <a href="...">). No markdown. No <html>/<body>.
- Keep every factual claim and every existing <a href> URL unchanged.
- Add depth by weaving more facts into existing sections and adding editorial H2/H3 sections — not by mirroring a research brief outline.
- Target ${opts.minWords}–${opts.maxWords} words total.
- When required anchor text is listed for a link, use it only when it fits naturally in a sentence; never as a parenthetical afterthought like (anchor text) or trailing See anchor.
- Do NOT add a "Related links" section.${COMPOSE_VOICE_RULES}${COMPOSE_SBD_RHETORIC_RULES}${composeFaqPromptRules(opts.includeFaq)}${COMPOSE_EXPAND_FORBIDDEN_PATTERNS}${topicBlock}${subtopicsBlock}`;
}

export function buildExpandArticleComposeUserPrompt(opts: ExpandArticleComposePromptOpts): string {
  return [
    `Current word count is below target (${opts.minWords}–${opts.maxWords} words). Expand the article in brand editorial voice.`,
    "",
    opts.links.length
      ? `Required links:\n${formatWriterLinksForPrompt(opts.links, { exactAnchorLabels: false })}`
      : "",
    "",
    "Extracted facts (JSON — use for depth, not as section headings):",
    JSON.stringify(opts.facts, null, 2),
    "",
    "Current HTML to expand:",
    opts.currentHtml.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function expandArticleComposeDepth(opts: {
  html: string;
  facts: ContentFacts;
  links: WriterLink[];
  minWords: number;
  maxWords: number;
  subtopics?: string[];
  topic?: string;
  includeFaq?: boolean;
}): Promise<string> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  const systemPrompt = buildExpandArticleComposeSystemPrompt(opts);
  const userPrompt = buildExpandArticleComposeUserPrompt({
    facts: opts.facts,
    links: opts.links,
    minWords: opts.minWords,
    maxWords: opts.maxWords,
    subtopics: opts.subtopics,
    topic: opts.topic,
    includeFaq: opts.includeFaq,
    currentHtml: opts.html,
  });

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
