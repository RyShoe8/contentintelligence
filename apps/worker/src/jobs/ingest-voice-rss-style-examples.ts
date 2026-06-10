import type { Db } from "mongodb";
import {
  formatStyleExamplesSyncSummary,
  isStyleSourceUrlExcluded,
  mergeVoiceBrandMemory,
  normalizeStyleSourceUrl,
  updateVoiceStyleExamplesSyncStatus,
  upsertWriterStyleExampleFromRss,
  type Voice,
} from "@content-resourcer/db";
import { env } from "../env.js";
import { fetchSafeText } from "../safe-fetch.js";
import { extractHumanFingerprintsFromHtml } from "../services/rewriter/extract-human-fingerprints.js";
import { extractComposeStyleKit } from "../services/rewriter/extract-compose-style-kit.js";
import { resolveArticleHtmlFromRssItem } from "../services/rss/extract-article-html.js";
import { parseRssFeed } from "../services/rss/parse-rss-feed.js";

export type IngestVoiceRssStyleExamplesResult = {
  ingested: number;
  updated: number;
  skipped: number;
  failed: number;
  skip_reasons?: {
    excluded?: number;
    invalid_url?: number;
    no_body?: number;
  };
  feed_fetch_failed?: boolean;
};

function initSkipReasons(): NonNullable<IngestVoiceRssStyleExamplesResult["skip_reasons"]> {
  return { excluded: 0, invalid_url: 0, no_body: 0 };
}

function bumpSkipReason(
  result: IngestVoiceRssStyleExamplesResult,
  reason: keyof NonNullable<IngestVoiceRssStyleExamplesResult["skip_reasons"]>,
): void {
  result.skipped += 1;
  if (!result.skip_reasons) result.skip_reasons = initSkipReasons();
  result.skip_reasons[reason] = (result.skip_reasons[reason] ?? 0) + 1;
}

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
    result.feed_fetch_failed = true;
    result.failed += 1;
    return result;
  }

  const items = parseRssFeed(xml, env.voiceRssMaxArticles);
  const excluded = voice.excluded_style_source_urls ?? [];

  for (const item of items) {
    const sourceUrl = normalizeStyleSourceUrl(item.link);
    if (!sourceUrl) {
      bumpSkipReason(result, "invalid_url");
      continue;
    }
    if (isStyleSourceUrlExcluded(sourceUrl, excluded)) {
      bumpSkipReason(result, "excluded");
      continue;
    }

    try {
      const html = await resolveArticleHtmlFromRssItem(
        item,
        fetchSafeText,
        env.voiceRssArticleMaxChars,
      );
      if (!html) {
        bumpSkipReason(result, "no_body");
        continue;
      }

      const composeStyleKit = await extractComposeStyleKit(html);

      const { created } = await upsertWriterStyleExampleFromRss(db, {
        organization_id: voice.organization_id,
        voice_id: voice.id,
        title: item.title.trim() || sourceUrl,
        final_html: html,
        source_url: sourceUrl,
        created_by: voice.created_by,
        compose_style_kit: composeStyleKit,
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

export async function ingestVoiceRssStyleExamplesAndRecordSync(
  db: Db,
  voice: Voice,
): Promise<IngestVoiceRssStyleExamplesResult> {
  try {
    const result = await ingestVoiceRssStyleExamples(db, voice);
    await updateVoiceStyleExamplesSyncStatus(db, voice.id, {
      style_examples_synced_at: new Date(),
      style_examples_sync_summary: formatStyleExamplesSyncSummary(result),
      style_examples_sync_error: undefined,
    });
    return result;
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await updateVoiceStyleExamplesSyncStatus(db, voice.id, {
      style_examples_synced_at: new Date(),
      style_examples_sync_summary: "Sync failed",
      style_examples_sync_error: message,
    }).catch(() => {});
    throw e;
  }
}
