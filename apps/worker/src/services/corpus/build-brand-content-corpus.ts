import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import {
  listWriterStyleExamplesForVoice,
  writerArticleHtmlForLearning,
  type Voice,
} from "@content-resourcer/db";
import { convert } from "html-to-text";
import { fetchSafeText } from "../../safe-fetch.js";
import { env } from "../../env.js";
import { parseRssFeed } from "../rss/parse-rss-feed.js";

export type CorpusSourceType =
  | "landingPages"
  | "blogs"
  | "newsletters"
  | "socialPosts"
  | "replies"
  | "generatedPosts";

export type WeightedChunk = {
  type: CorpusSourceType;
  weight: number;
  text: string;
  label: string;
};

export type BrandContentCorpus = {
  chunks: WeightedChunk[];
  hash: string;
  promptText: string;
};

export const DEFAULT_SOURCE_WEIGHTS: Record<CorpusSourceType, number> = {
  socialPosts: 0.8,
  replies: 1.3,
  newsletters: 1.1,
  blogs: 1.2,
  landingPages: 0.4,
  generatedPosts: 1.0,
};

const MAX_CHARS_PER_SOURCE = 20_000;
const STYLE_EXAMPLE_CORPUS_CHARS = 8000;
const BLOG_MIN_CHARS = 800;

function stripHtmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [{ selector: "a", options: { ignoreHref: true } }],
  }).trim();
}

function capText(text: string, max = MAX_CHARS_PER_SOURCE): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function classifyBlogText(text: string): CorpusSourceType {
  return text.length >= BLOG_MIN_CHARS ? "blogs" : "newsletters";
}

function extractReplyLikeBlocks(html: string): string[] {
  const text = stripHtmlToText(html);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const replies: string[] = [];
  for (const line of lines) {
    if (line.length < 20 || line.length > 400) continue;
    if (/^(reply|re:|comment|@)/i.test(line)) replies.push(line);
  }
  return replies.slice(0, 5);
}

export function computeCorpusHash(
  chunks: WeightedChunk[],
  voice: Voice,
  styleExampleKeys: string[] = [],
): string {
  const parts = [
    voice.website_url,
    voice.rss_feed_url,
    ...voice.social_links.map((l) => l.url),
    ...voice.keywords,
    ...styleExampleKeys,
    ...chunks.map((c) => `${c.type}:${c.label}:${c.text.length}`),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export function formatCorpusForPrompt(chunks: WeightedChunk[], maxChars = env.brandCorpusMaxChars): string {
  const sorted = [...chunks].sort((a, b) => b.weight - a.weight);
  const sections: string[] = [];
  let used = 0;

  for (const chunk of sorted) {
    const header = `[${chunk.type} weight=${chunk.weight}] ${chunk.label}`;
    const body = capText(chunk.text, Math.min(8000, maxChars - used - header.length - 4));
    if (!body) continue;
    const block = `${header}\n${body}`;
    if (used + block.length > maxChars) break;
    sections.push(block);
    used += block.length + 2;
  }

  return sections.join("\n\n").trim();
}

export async function buildBrandContentCorpus(
  db: Db,
  voice: Voice,
): Promise<BrandContentCorpus> {
  const chunks: WeightedChunk[] = [];

  if (voice.keywords.length) {
    chunks.push({
      type: "landingPages",
      weight: 0.2,
      label: "Voice keywords",
      text: voice.keywords.join(", "),
    });
  }

  if (voice.website_url) {
    const html = await fetchSafeText(voice.website_url);
    if (html) {
      chunks.push({
        type: "landingPages",
        weight: DEFAULT_SOURCE_WEIGHTS.landingPages,
        label: `Website: ${voice.website_url}`,
        text: capText(stripHtmlToText(html)),
      });
    }
  }

  const styleExamples = await listWriterStyleExamplesForVoice(
    db,
    voice.organization_id,
    voice.id,
  );
  const styleExampleKeys: string[] = [];

  for (const example of styleExamples) {
    const html = writerArticleHtmlForLearning(example);
    if (!html) continue;
    const plain = capText(stripHtmlToText(html), STYLE_EXAMPLE_CORPUS_CHARS);
    if (!plain) continue;
    const sourceUrl = example.reference_urls?.[0]?.trim();
    styleExampleKeys.push(`${example.id}:${sourceUrl ?? ""}:${example.updated_at.toISOString()}`);
    chunks.push({
      type: "blogs",
      weight: DEFAULT_SOURCE_WEIGHTS.blogs,
      label: sourceUrl ? `Style example: ${example.title} (${sourceUrl})` : `Style example: ${example.title}`,
      text: `${example.title}\n${plain}`,
    });
  }

  const hasIngestedStyleExamples = styleExamples.some((ex) => ex.reference_urls?.[0]?.trim());

  if (voice.rss_feed_url && !hasIngestedStyleExamples) {
    const xml = await fetchSafeText(voice.rss_feed_url);
    if (xml) {
      const items = parseRssFeed(xml, 10);
      if (items.length) {
        for (const item of items) {
          const bodyText = item.summaryText || item.title;
          const type = classifyBlogText(bodyText);
          const body = capText(`${item.title}\n${bodyText}`);
          if (!body) continue;
          chunks.push({
            type,
            weight: DEFAULT_SOURCE_WEIGHTS[type],
            label: `RSS (${type}): ${item.title}`,
            text: body,
          });
        }
      } else {
        chunks.push({
          type: "newsletters",
          weight: DEFAULT_SOURCE_WEIGHTS.newsletters,
          label: `RSS: ${voice.rss_feed_url}`,
          text: capText(stripHtmlToText(xml)),
        });
      }
    }
  }

  for (const link of voice.social_links) {
    const label = link.label ? `${link.label} (${link.url})` : link.url;
    const html = await fetchSafeText(link.url);
    if (!html) continue;

    chunks.push({
      type: "socialPosts",
      weight: DEFAULT_SOURCE_WEIGHTS.socialPosts,
      label: `Social: ${label}`,
      text: capText(stripHtmlToText(html)),
    });

    for (const reply of extractReplyLikeBlocks(html)) {
      chunks.push({
        type: "replies",
        weight: DEFAULT_SOURCE_WEIGHTS.replies,
        label: `Reply-like: ${label}`,
        text: reply,
      });
    }
  }

  const hash = computeCorpusHash(chunks, voice, styleExampleKeys);
  const promptText = formatCorpusForPrompt(chunks);

  return { chunks, hash, promptText };
}

export function behaviorCorpusText(chunks: WeightedChunk[]): string {
  const postLike = chunks.filter(
    (c) =>
      c.type === "generatedPosts" ||
      c.type === "socialPosts" ||
      c.type === "replies" ||
      c.type === "blogs",
  );
  return formatCorpusForPrompt(postLike, Math.min(env.brandCorpusMaxChars, 12000));
}
