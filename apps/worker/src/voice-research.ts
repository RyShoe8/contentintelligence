import type { Voice } from "@content-resourcer/db";
import { convert } from "html-to-text";
import { XMLParser } from "fast-xml-parser";
import { fetchSafeText } from "./safe-fetch.js";

const MAX_CHARS_PER_SOURCE = 20_000;
const MAX_RSS_ITEMS = 10;

function stripHtmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [{ selector: "a", options: { ignoreHref: true } }],
  }).trim();
}

function capText(label: string, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const body = trimmed.length > MAX_CHARS_PER_SOURCE ? `${trimmed.slice(0, MAX_CHARS_PER_SOURCE)}…` : trimmed;
  return `### ${label}\n${body}`;
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

export async function buildVoiceResearchCorpus(voice: Voice): Promise<string> {
  const sections: string[] = [];

  if (voice.keywords.length) {
    sections.push(`### Voice keywords\n${voice.keywords.join(", ")}`);
  }

  if (voice.website_url) {
    const html = await fetchSafeText(voice.website_url);
    if (html) {
      sections.push(capText(`Website: ${voice.website_url}`, stripHtmlToText(html)));
    }
  }

  if (voice.rss_feed_url) {
    const xml = await fetchSafeText(voice.rss_feed_url);
    if (xml) {
      const items = extractRssItems(xml);
      if (items.length) {
        const body = items
          .map((i) => `- ${i.title}${i.description ? `: ${i.description}` : ""}`)
          .join("\n");
        sections.push(capText(`RSS: ${voice.rss_feed_url}`, body));
      } else {
        sections.push(capText(`RSS raw: ${voice.rss_feed_url}`, stripHtmlToText(xml)));
      }
    }
  }

  for (const link of voice.social_links) {
    const label = link.label ? `${link.label} (${link.url})` : link.url;
    const html = await fetchSafeText(link.url);
    if (html) {
      sections.push(capText(`Social: ${label}`, stripHtmlToText(html)));
    }
  }

  return sections.join("\n\n").trim();
}
