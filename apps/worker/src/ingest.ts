import "./env.js";
import type { EmailImage, KeyPoint } from "@content-resourcer/db";
import {
  findSignalByExternalId,
  getDb,
  ensureIndexes,
  getContentSignal,
  getGmailOAuth,
  upsertSignalItem,
  listEnabledSources,
  purgeExpiredSignalItems,
  setGmailOAuthIngestError,
  touchContentSignalLastIngest,
} from "@content-resourcer/db";
import {
  createGmailClient,
  extractHtmlFromPayload,
  getNormalizedMessageAndPayload,
  listMessageIds,
} from "./gmail-client.js";
import { fetchEmailImageAttachments } from "./email-images.js";
import { env } from "./env.js";
import { ingestLog, ingestVerbose } from "./ingest-log.js";
import { buildGmailQuery } from "./gmail-query.js";
import {
  buildFullSignalItem,
  buildMinimalSignalItem,
  extractAndTruncate,
  extractFullBodyText,
  prefilter,
} from "./pipeline.js";
import {
  extractDealMetricsRegex,
  extractDealsFoundRegex,
  pickBestDeal,
  mergeDealExtractions,
  type DealMetricsLlmPartial,
} from "./deal-metrics.js";
import {
  extractDealMetricsWithLlm,
  extractKeyPointsWithLlm,
  summarizeEmailBody,
} from "./summarize.js";

export type IngestSourceError = {
  sourceId: string;
  email_address: string;
  error: string;
};

export type IngestStats = {
  sources: number;
  messagesListed: number;
  skippedDuplicate: number;
  skippedError: number;
  storedMinimal: number;
  storedFull: number;
  purgedItems: number;
  archivedPosts: number;
  sourceErrors: IngestSourceError[];
};

const verbose = () => ingestVerbose();

function effectiveLookbackHours(
  configured: number,
  lastCompleted: Date | undefined,
  minGapHours: number,
): number {
  if (!lastCompleted || !Number.isFinite(lastCompleted.getTime())) {
    return configured;
  }
  const gapMs = Date.now() - lastCompleted.getTime();
  if (gapMs <= 0) return configured;
  const gapHours = gapMs / 3600_000;
  const bounded = Math.max(minGapHours, gapHours);
  return Math.min(configured, bounded);
}

export async function runIngest(contentSignalId?: string): Promise<IngestStats> {
  const stats: IngestStats = {
    sources: 0,
    messagesListed: 0,
    skippedDuplicate: 0,
    skippedError: 0,
    storedMinimal: 0,
    storedFull: 0,
    purgedItems: 0,
    archivedPosts: 0,
    sourceErrors: [],
  };

  const mongoConfigured = Boolean(env.mongodbUri);
  ingestLog("run_start", { mongodbConfigured: mongoConfigured, contentSignalId: contentSignalId ?? null });

  if (!env.mongodbUri) {
    ingestLog("run_abort", { reason: "MONGODB_URI unset" });
    throw new Error("MONGODB_URI is not set");
  }

  const db = await getDb(env.mongodbUri);
  await ensureIndexes(db);

  const sourceList = await listEnabledSources(db, contentSignalId);
  stats.sources = sourceList.length;

  ingestLog("sources_loaded", {
    sourceCount: sourceList.length,
    sources: sourceList.map((s) => ({
      id: s.id,
      content_signal_id: s.content_signal_id,
      enabled: s.enabled,
      email_address: s.config.email_address,
    })),
  });

  const contentSignalCache = new Map<string, Awaited<ReturnType<typeof getContentSignal>>>();
  const purgedSignals = new Set<string>();

  for (const source of sourceList) {
    ingestLog("source_begin", {
      sourceId: source.id,
      content_signal_id: source.content_signal_id,
      email_address: source.config.email_address,
    });

    let contentSignal = contentSignalCache.get(source.content_signal_id);
    if (contentSignal === undefined) {
      contentSignal = await getContentSignal(db, source.content_signal_id);
      contentSignalCache.set(source.content_signal_id, contentSignal);
    }
    if (!contentSignal) {
      ingestLog("content_signal_skip", { sourceId: source.id, reason: "content_signal_not_found" });
      continue;
    }
    if (!contentSignal.active) {
      ingestLog("content_signal_skip", {
        sourceId: source.id,
        reason: "content_signal_inactive",
        contentSignalId: contentSignal.id,
      });
      continue;
    }

    const email = source.config.email_address?.trim();
    if (!email) {
      ingestLog("oauth_skip", {
        sourceId: source.id,
        hint: "connect Gmail on the source editor",
      });
      console.warn(`[ingest] No email on source ${source.id}; connect Gmail first.`);
      continue;
    }

    const oauth = await getGmailOAuth(db, email);
    if (!oauth?.refresh_token) {
      ingestLog("oauth_skip", {
        sourceId: source.id,
        email_address: email,
        hint: "check gmail_oauth collection for refresh_token",
      });
      console.warn(`[ingest] No OAuth token for ${email}; connect Gmail first.`);
      continue;
    }

    let gmail;
    try {
      gmail = createGmailClient(oauth.refresh_token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ingestLog("gmail_client_error", { sourceId: source.id, message: msg });
      if (verbose() && e instanceof Error && e.stack) {
        console.error("[ingest] Gmail client stack", e.stack);
      }
      continue;
    }

    const configuredLookback = contentSignal.lookback_window_hours;
    const effectiveHours = effectiveLookbackHours(
      configuredLookback,
      contentSignal.last_ingest_completed_at,
      env.ingestMinGapHours,
    );
    const gmailQ = buildGmailQuery(source.config, { lookbackHours: effectiveHours });
    ingestLog("gmail_query", {
      sourceId: source.id,
      q: gmailQ,
      effectiveLookbackHours: effectiveHours,
      configuredLookbackHours: configuredLookback,
      ...(contentSignal.last_ingest_completed_at
        ? { lastIngestCompletedAt: contentSignal.last_ingest_completed_at.toISOString() }
        : {}),
    });

    let ids: string[] = [];
    try {
      ids = await listMessageIds(gmail, source.config, 80, effectiveHours);
      await setGmailOAuthIngestError(db, email, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ingest] list messages failed", source.id, e);
      ingestLog("list_messages_error", { sourceId: source.id, message: msg });
      await setGmailOAuthIngestError(db, email, msg);
      stats.sourceErrors.push({
        sourceId: source.id,
        email_address: email,
        error: msg,
      });
      if (msg.includes("invalid_grant")) {
        console.warn(
          `[ingest] Gmail token rejected for ${email}. ` +
            "Re-connect Gmail on the source editor and ensure Render GMAIL_CLIENT_ID/SECRET match Vercel.",
        );
      }
      continue;
    }

    ingestLog("gmail_list_result", {
      sourceId: source.id,
      idCount: ids.length,
      ...(verbose() && ids.length > 0 ? { sampleIds: ids.slice(0, 3) } : {}),
    });

    stats.messagesListed += ids.length;

    for (const messageId of ids) {
      try {
        if (verbose()) {
          ingestLog("message_begin", { sourceId: source.id, messageId });
        }

        const existingRow = await findSignalByExternalId(db, messageId);

        const fetched = await getNormalizedMessageAndPayload(gmail, messageId);
        if (!fetched) {
          stats.skippedError++;
          if (verbose()) {
            ingestLog("message_skip", { messageId, reason: "normalize_failed" });
          }
          continue;
        }
        const { normalized, payload } = fetched;
        const emailHtmlRaw = extractHtmlFromPayload(payload);
        const emailHtmlForRow = emailHtmlRaw.trim().length > 0 ? emailHtmlRaw : null;

        const pf = prefilter(normalized, contentSignal, source.config);
        if (verbose()) {
          ingestLog("prefilter", { messageId, ok: pf.ok, reason: pf.ok ? undefined : pf.reason });
        }

        if (!pf.ok) {
          const minimal = buildMinimalSignalItem(
            contentSignal,
            source,
            normalized,
            pf.reason,
            emailHtmlForRow,
          );
          if (existingRow) {
            minimal.id = existingRow.id;
            minimal.created_at = existingRow.created_at;
          }
          try {
            const outcome = await upsertSignalItem(db, minimal);
            if (outcome === "inserted") stats.storedMinimal++;
            if (verbose()) {
              ingestLog("insert_ok", { messageId, kind: "minimal", skipReason: pf.reason, outcome });
            }
          } catch (e: unknown) {
            console.error("[ingest] upsert minimal", e);
            stats.skippedError++;
            ingestLog("insert_error", {
              messageId,
              kind: "minimal",
              message: e instanceof Error ? e.message : String(e),
            });
          }
          continue;
        }

        let extracted = extractAndTruncate(normalized.raw_content, source.config.scan_body);
        extracted = extracted.slice(0, env.maxAiInputChars);

        const dealParseText = extractFullBodyText(normalized.raw_content).slice(0, env.maxAiInputChars);

        let summary = "";
        let key_points: KeyPoint[] = [];
        const aiSummaryOn = source.config.ai_summary_enabled !== false;
        if (env.openaiApiKey && aiSummaryOn) {
          try {
            summary = await summarizeEmailBody(extracted);
          } catch (e) {
            console.error("[ingest] OpenAI failed", e);
          }
        }
        try {
          key_points = await extractKeyPointsWithLlm(dealParseText, normalized.subject);
        } catch (e) {
          console.error("[ingest] key points extraction failed", e);
        }

        const unitTokens =
          contentSignal.deal_unit_tokens?.length > 0
            ? contentSignal.deal_unit_tokens
            : ["SC", "FC", "GC"];

        let dealLlm: DealMetricsLlmPartial | null = null;
        if (env.openaiApiKey) {
          try {
            dealLlm = await extractDealMetricsWithLlm(dealParseText, unitTokens);
          } catch (e) {
            console.error("[ingest] deal metrics LLM failed", e);
          }
        }
        const dealSourceText = `${normalized.subject}\n${dealParseText}`;
        const deals_found = extractDealsFoundRegex(normalized.subject, dealParseText, unitTokens);
        const dealRegex =
          pickBestDeal(deals_found) ??
          extractDealMetricsRegex(normalized.subject, dealParseText, unitTokens);
        const deal_metrics = mergeDealExtractions(dealLlm, dealRegex, dealSourceText);

        let email_images: EmailImage[] = [];
        try {
          email_images = await fetchEmailImageAttachments(gmail, messageId, payload);
        } catch (e) {
          console.error("[ingest] email images failed", messageId, e);
        }

        const full = buildFullSignalItem(
          contentSignal,
          source,
          normalized,
          extracted,
          summary,
          deal_metrics,
          deals_found.length > 0 ? deals_found : undefined,
          email_images.length ? email_images : undefined,
          emailHtmlForRow,
          key_points,
        );
        if (existingRow) {
          full.id = existingRow.id;
          full.created_at = existingRow.created_at;
        }
        try {
          const outcome = await upsertSignalItem(db, full);
          if (outcome === "inserted") stats.storedFull++;
          if (verbose()) {
            ingestLog("insert_ok", { messageId, kind: "full", outcome });
          }
        } catch (e: unknown) {
          console.error("[ingest] upsert full", e);
          stats.skippedError++;
          ingestLog("insert_error", {
            messageId,
            kind: "full",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      } catch (e) {
        console.error("[ingest] message error", messageId, e);
        stats.skippedError++;
        ingestLog("message_error", {
          messageId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    try {
      await touchContentSignalLastIngest(db, contentSignal.id, new Date());
    } catch (e) {
      console.error("[ingest] touchContentSignalLastIngest failed", contentSignal.id, e);
    }

    if (!purgedSignals.has(contentSignal.id)) {
      purgedSignals.add(contentSignal.id);
      try {
        const purge = await purgeExpiredSignalItems(
          db,
          contentSignal.id,
          contentSignal.lookback_window_hours,
        );
        stats.purgedItems += purge.deletedItems;
        stats.archivedPosts += purge.archivedPosts;
        if (purge.deletedItems > 0 || purge.archivedPosts > 0) {
          ingestLog("retention_purge", {
            contentSignalId: contentSignal.id,
            lookbackHours: contentSignal.lookback_window_hours,
            ...purge,
          });
        }
      } catch (e) {
        console.error("[ingest] purgeExpiredSignalItems failed", contentSignal.id, e);
      }
    }
  }

  console.log("[ingest] stats", stats);
  ingestLog("ingest_done", { ...stats });
  return stats;
}
