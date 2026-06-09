import { WRITER_SOURCE_MIN_CHARS, writerStyleExampleHtmlFromPaste } from "@content-resourcer/db";
import type { RssFeedItem } from "./parse-rss-feed.js";

const HTML_TAG_RE = /<[a-z][\s\S]*>/i;

const MAIN_CONTENT_SELECTORS = [
  /<article\b[^>]*>([\s\S]*?)<\/article>/i,
  /<main\b[^>]*>([\s\S]*?)<\/main>/i,
  /<div\b[^>]*\bclass=["'][^"']*\b(?:post-content|entry-content|article-content|blog-content|single-content|content-area)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  /<div\b[^>]*\bid=["'](?:content|main-content|primary-content)["'][^>]*>([\s\S]*?)<\/div>/i,
];

function capHtml(html: string, maxChars: number): string {
  if (html.length <= maxChars) return html;
  return `${html.slice(0, maxChars)}\n<!-- [Truncated for length.] -->`;
}

function stripBoilerplate(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, " ")
    .trim();
}

export function extractMainContentHtml(pageHtml: string): string {
  const cleaned = stripBoilerplate(pageHtml);
  for (const re of MAIN_CONTENT_SELECTORS) {
    const m = cleaned.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  const bodyMatch = cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]?.trim()) return bodyMatch[1].trim();
  return cleaned;
}

function normalizeArticleHtml(raw: string, maxChars: number): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const html = HTML_TAG_RE.test(trimmed)
    ? capHtml(trimmed, maxChars)
    : writerStyleExampleHtmlFromPaste(trimmed);
  if (html.length < WRITER_SOURCE_MIN_CHARS) return null;
  return html;
}

export async function resolveArticleHtmlFromRssItem(
  item: RssFeedItem,
  fetchText: (url: string) => Promise<string | null>,
  maxChars: number,
): Promise<string | null> {
  if (item.encodedHtml) {
    const fromFeed = normalizeArticleHtml(item.encodedHtml, maxChars);
    if (fromFeed) return fromFeed;
  }

  const pageHtml = await fetchText(item.link);
  if (!pageHtml) {
    if (item.summaryText.length >= WRITER_SOURCE_MIN_CHARS) {
      return normalizeArticleHtml(item.summaryText, maxChars);
    }
    return null;
  }

  const mainHtml = extractMainContentHtml(pageHtml);
  const fromPage = normalizeArticleHtml(mainHtml, maxChars);
  if (fromPage) return fromPage;

  if (item.summaryText.length >= WRITER_SOURCE_MIN_CHARS) {
    return normalizeArticleHtml(item.summaryText, maxChars);
  }

  return null;
}
