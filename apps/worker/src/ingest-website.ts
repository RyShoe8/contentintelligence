import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import {
  findSignalByExternalId,
  getContentSignal,
  upsertSignalItem,
  touchContentSignalLastIngest,
  recordContentSignalIngestAttempt,
  purgeExpiredSignalItems,
  SOURCE_TYPE_WEBSITE,
} from "@content-resourcer/db";
import type { WebsiteSource } from "@content-resourcer/db";
import { discoverRssFeed } from "./services/rss/discover-rss.js";
import { parseRssFeed } from "./services/rss/parse-rss-feed.js";
import { extractMainContentHtml } from "./services/rss/extract-article-html.js";
import { extractKeyPointsWithLlm, summarizeEmailBody } from "./summarize.js";
import { ingestLog } from "./ingest-log.js";
import type { IngestStats } from "./ingest.js";

const SCRAPE_TIMEOUT_MS = 12000;
const MAX_ARTICLES_PER_URL = 20;

async function safeFetch(url: string, timeoutMs = SCRAPE_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ContentIntelligence/1.0" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract article URLs from a scraped homepage/index page */
function extractArticleUrls(html: string, baseUrl: string): string[] {
  const urls: Set<string> = new Set();
  // Match href values from anchor tags
  const re = /href=["']([^"'#?]+)["']/gi;
  let m: RegExpExecArray | null;
  const base = new URL(baseUrl);
  while ((m = re.exec(html)) !== null) {
    try {
      const resolved = new URL(m[1], baseUrl);
      // Only same-origin links that look like article paths
      if (resolved.host !== base.host) continue;
      const path = resolved.pathname;
      if (path === "/" || path === "") continue;
      // Heuristic: paths with slug-like segments (words separated by hyphens)
      if (/\/[a-z0-9]+(?:-[a-z0-9]+){2,}/.test(path)) {
        urls.add(resolved.href.split("?")[0].split("#")[0]);
      }
    } catch {
      // ignore
    }
    if (urls.size >= MAX_ARTICLES_PER_URL) break;
  }
  return [...urls];
}

/** Parse published date from common HTML meta tags */
function extractPublishedDate(html: string): Date | undefined {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
    /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return undefined;
}

/** Extract <title> from HTML */
function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim().replace(/\s+/g, " ") : "";
}

export async function runWebsiteIngest(
  db: Db,
  source: WebsiteSource,
  contentSignalId: string,
  stats: IngestStats,
): Promise<void> {
  const signal = await getContentSignal(db, contentSignalId);
  if (!signal) return;

  const lookbackHours = signal.lookback_window_hours;
  const lookbackMs = lookbackHours * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - lookbackMs);

  for (const url of source.config.urls) {
    ingestLog(`[website] Processing: ${url}`);

    // Discover RSS — use cached meta if available
    let rssUrl: string | null = null;
    const existingMeta = source.config.url_meta?.find((m) => m.url === url);
    if (existingMeta?.rss_url) {
      rssUrl = existingMeta.rss_url;
    } else {
      rssUrl = await discoverRssFeed(url);
      ingestLog(`[website] RSS for ${url}: ${rssUrl ?? "none"}`);
    }

    const articlesToProcess: Array<{
      url: string;
      title: string;
      bodyText: string;
      publishedAt: Date | undefined;
    }> = [];

    if (rssUrl) {
      // ── RSS path ─────────────────────────────────
      const xml = await safeFetch(rssUrl);
      if (!xml) {
        ingestLog(`[website] Failed to fetch RSS: ${rssUrl}`);
        continue;
      }
      const items = parseRssFeed(xml, 50);
      for (const item of items) {
        const pubDate = item.publishedAt ? new Date(item.publishedAt) : undefined;
        if (pubDate && pubDate < cutoff) continue;

        const pageHtml = await safeFetch(item.link);
        const bodyText = pageHtml
          ? extractMainContentHtml(pageHtml).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          : item.summaryText;

        if (bodyText.length < 100) continue;
        articlesToProcess.push({ url: item.link, title: item.title, bodyText, publishedAt: pubDate });
      }
    } else {
      // ── Scrape path ───────────────────────────────
      const html = await safeFetch(url);
      if (!html) continue;
      const articleUrls = extractArticleUrls(html, url);

      for (const articleUrl of articleUrls.slice(0, MAX_ARTICLES_PER_URL)) {
        const articleHtml = await safeFetch(articleUrl);
        if (!articleHtml) continue;
        const pubDate = extractPublishedDate(articleHtml);
        if (pubDate && pubDate < cutoff) continue;
        const mainHtml = extractMainContentHtml(articleHtml);
        const bodyText = mainHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (bodyText.length < 100) continue;
        const title = extractTitle(articleHtml) || articleUrl;
        articlesToProcess.push({ url: articleUrl, title, bodyText, publishedAt: pubDate });
      }
    }

    ingestLog(`[website] ${articlesToProcess.length} articles to process from ${url}`);
    stats.messagesListed += articlesToProcess.length;

    for (const article of articlesToProcess) {
      // Dedup by URL — base64-encode the URL as external_id
      const externalId = `website:${Buffer.from(article.url).toString("base64").slice(0, 32)}`;
      const existing = await findSignalByExternalId(db, externalId);
      if (existing) {
        stats.skippedDuplicate++;
        continue;
      }

      try {
        // Build a SignalItem-compatible object.
        // source_type "website" is now accepted by signalItemSchema.
        // sender_from is not meaningful for websites — store empty string per schema default.
        const baseItem = {
          id: randomUUID(),
          organization_id: signal.organization_id,
          content_signal_id: contentSignalId,
          source_id: source.id,
          source_type: SOURCE_TYPE_WEBSITE as "website",
          source_name: new URL(url).hostname,
          sender_from: "",
          title: article.title,
          raw_content: article.bodyText.slice(0, 50_000),
          extracted_text: article.bodyText.slice(0, 50_000),
          detected_keywords: [] as string[],
          relevance_score: 1,
          original_url: article.url,
          key_points: [] as [],
          external_id: externalId,
          ai_summary: null as string | null,
          ai_processed: false,
          skip_reason: null as string | null,
          created_at: new Date(),
          ...(article.publishedAt ? { email_sent_at: article.publishedAt } : {}),
        };

        // Try AI processing first; fall back to minimal upsert
        const aiEnabled = source.config.ai_summary_enabled;
        if (aiEnabled) {
          try {
            const [summary, keyPoints] = await Promise.all([
              summarizeEmailBody(article.bodyText),
              extractKeyPointsWithLlm(article.bodyText, article.title),
            ]);
            const fullItem = {
              ...baseItem,
              ai_summary: summary || null,
              key_points: keyPoints,
              ai_processed: true,
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const outcome = await upsertSignalItem(db, fullItem as any);
            if (outcome === "inserted") {
              stats.storedFull++;
            } else {
              stats.updatedFull++;
            }
          } catch (e) {
            ingestLog(`[website] AI processing failed for ${article.url}: ${e}`);
            // Fall back to minimal insert without AI fields
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const outcome = await upsertSignalItem(db, baseItem as any);
            if (outcome === "inserted") stats.storedMinimal++;
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const outcome = await upsertSignalItem(db, baseItem as any);
          if (outcome === "inserted") stats.storedMinimal++;
        }
      } catch (e) {
        ingestLog(`[website] Failed to store ${article.url}: ${e}`);
        stats.skippedError++;
      }
    }
  }

  // Record ingest attempt and touch last-ingest timestamp
  const now = new Date();
  await recordContentSignalIngestAttempt(db, contentSignalId, { attemptedAt: now, error: null });

  const purge = await purgeExpiredSignalItems(db, contentSignalId, lookbackHours);
  stats.purgedItems += purge.deletedItems;
  stats.archivedPosts += purge.archivedPosts;

  await touchContentSignalLastIngest(db, contentSignalId, now);
}
