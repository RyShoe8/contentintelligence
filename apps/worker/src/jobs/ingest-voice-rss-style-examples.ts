import type { Db } from "mongodb";
import {
  isStyleSourceUrlExcluded,
  mergeVoiceBrandMemory,
  normalizeStyleSourceUrl,
  upsertWriterStyleExampleFromRss,
  type Voice,
} from "@content-resourcer/db";
import { env } from "../env.js";
import { fetchSafeText } from "../safe-fetch.js";
import { extractHumanFingerprintsFromHtml } from "../services/rewriter/extract-human-fingerprints.js";
import { resolveArticleHtmlFromRssItem } from "../services/rss/extract-article-html.js";
import { parseRssFeed } from "../services/rss/parse-rss-feed.js";

export type IngestVoiceRssStyleExamplesResult = {
  ingested: number;
  updated: number;
  skipped: number;
  failed: number;
};

async function mergeFingerprintsFromHtml(db: Db, voice: Voice, html: string): Promise<void> {
  if (!voice.brand_profile) return;
  const patch = await extractHumanFingerprintsFromHtml(html);
  const hasAny = Object.values(patch).some((v) => Array.isArray(v) && v.length > 0);
  if (!hasAny) return;
  await mergeVoiceBrandMemory(db, voice.id, patch);
}

export async function ingestVoiceRssStyleExamples(
  db: Db,
  voice: Voice,
): Promise<IngestVoiceRssStyleExamplesResult> {
  const result: IngestVoiceRssStyleExamplesResult = {
    ingested: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  const feedUrl = voice.rss_feed_url?.trim();
  if (!feedUrl) return result;

  const xml = await fetchSafeText(feedUrl);
  if (!xml) {
    result.failed += 1;
    return result;
  }

  const items = parseRssFeed(xml, env.voiceRssMaxArticles);
  const excluded = voice.excluded_style_source_urls ?? [];

  for (const item of items) {
    const sourceUrl = normalizeStyleSourceUrl(item.link);
    if (!sourceUrl) {
      result.skipped += 1;
      continue;
    }
    if (isStyleSourceUrlExcluded(sourceUrl, excluded)) {
      result.skipped += 1;
      continue;
    }

    try {
      const html = await resolveArticleHtmlFromRssItem(
        item,
        fetchSafeText,
        env.voiceRssArticleMaxChars,
      );
      if (!html) {
        result.skipped += 1;
        continue;
      }

      const { created } = await upsertWriterStyleExampleFromRss(db, {
        organization_id: voice.organization_id,
        voice_id: voice.id,
        title: item.title.trim() || sourceUrl,
        final_html: html,
        source_url: sourceUrl,
        created_by: voice.created_by,
      });

      await mergeFingerprintsFromHtml(db, voice, html);

      if (created) result.ingested += 1;
      else result.updated += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
