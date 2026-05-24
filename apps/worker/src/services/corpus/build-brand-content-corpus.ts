import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { listPostsForVoice, type Post, type Voice } from "@content-resourcer/db";
import { convert } from "html-to-text";
import { XMLParser } from "fast-xml-parser";
import { fetchSafeText } from "../../safe-fetch.js";
import { env } from "../../env.js";

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
  socialPosts: 1.0,
  replies: 1.3,
  newsletters: 1.1,
  blogs: 0.8,
  landingPages: 0.4,
  generatedPosts: 1.0,
};

const MAX_CHARS_PER_SOURCE = 20_000;
const MAX_RSS_ITEMS = 10;
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

function extractRssItems(xml: string): { title: string; description: string }[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
  });
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];

  const root = parsed as Record<string, unknown>;
  const channel =
    (root.rss as Record<string, unknown> | undefined)?.channel ??
    root.feed ??
    root.channel;

  if (!channel || typeof channel !== "object") return [];

  const ch = channel as Record<string, unknown>;
  const rawItems = ch.item ?? ch.entry;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const out: { title: string; description: string }[] = [];
  for (const item of items) {
    if (out.length >= MAX_RSS_ITEMS) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    const description = stripHtmlToText(
      String(row.description ?? row.summary ?? row.content ?? row["content:encoded"] ?? ""),
    );
    if (title || description) out.push({ title, description });
  }
  return out;
}

function classifyRssItem(item: { title: string; description: string }): CorpusSourceType {
  const len = item.description.length;
  return len >= BLOG_MIN_CHARS ? "blogs" : "newsletters";
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

function chunkFromPosts(posts: Post[]): WeightedChunk[] {
  const chunks: WeightedChunk[] = [];
  for (const post of posts) {
    const text = capText(post.social_copy, 2000);
    if (!text) continue;
    chunks.push({
      type: "generatedPosts",
      weight: DEFAULT_SOURCE_WEIGHTS.generatedPosts,
      label: `Post: ${post.title}`,
      text,
    });
  }
  return chunks;
}

export function computeCorpusHash(chunks: WeightedChunk[], voice: Voice): string {
  const parts = [
    voice.website_url,
    voice.rss_feed_url,
    ...voice.social_links.map((l) => l.url),
    ...voice.keywords,
    ...voice.content_signal_ids,
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

  if (voice.rss_feed_url) {
    const xml = await fetchSafeText(voice.rss_feed_url);
    if (xml) {
      const items = extractRssItems(xml);
      if (items.length) {
        for (const item of items) {
          const type = classifyRssItem(item);
          const body = capText(`${item.title}\n${item.description}`);
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

  if (voice.content_signal_ids.length) {
    const posts = await listPostsForVoice(db, voice.organization_id, voice.content_signal_ids, {
      status: "draft",
      limit: 200,
    });
    chunks.push(...chunkFromPosts(posts));
  }

  const hash = computeCorpusHash(chunks, voice);
  const promptText = formatCorpusForPrompt(chunks);

  return { chunks, hash, promptText };
}

export function behaviorCorpusText(chunks: WeightedChunk[]): string {
  const postLike = chunks.filter(
    (c) =>
      c.type === "generatedPosts" ||
      c.type === "socialPosts" ||
      c.type === "replies",
  );
  return formatCorpusForPrompt(postLike, Math.min(env.brandCorpusMaxChars, 12000));
}
