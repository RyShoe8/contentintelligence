import "./env.js";
import {
  findSignalByExternalId,
  getDb,
  ensureIndexes,
  getGmailOAuth,
  getVertical,
  insertSignalItem,
  listEnabledGmailSignals,
} from "@content-resourcer/db";
import { createGmailClient, getNormalizedMessage, listMessageIds } from "./gmail-client.js";
import { env } from "./env.js";
import { ingestLog, ingestVerbose } from "./ingest-log.js";
import { buildGmailQuery } from "./gmail-query.js";
import {
  buildFullSignalItem,
  buildMinimalSignalItem,
  extractAndTruncate,
  prefilter,
} from "./pipeline.js";
import {
  extractDealMetricsRegex,
  mergeDealExtractions,
  type DealMetricsLlmPartial,
} from "./deal-metrics.js";
import { extractDealMetricsWithLlm, summarizeEmailBody } from "./summarize.js";

export type IngestStats = {
  signals: number;
  messagesListed: number;
  skippedDuplicate: number;
  skippedError: number;
  storedMinimal: number;
  storedFull: number;
};

const verbose = () => ingestVerbose();

export async function runIngest(): Promise<IngestStats> {
  const stats: IngestStats = {
    signals: 0,
    messagesListed: 0,
    skippedDuplicate: 0,
    skippedError: 0,
    storedMinimal: 0,
    storedFull: 0,
  };

  const mongoConfigured = Boolean(env.mongodbUri);
  ingestLog("run_start", { mongodbConfigured: mongoConfigured });

  if (!env.mongodbUri) {
    ingestLog("run_abort", { reason: "MONGODB_URI unset" });
    throw new Error("MONGODB_URI is not set");
  }

  const db = await getDb(env.mongodbUri);
  await ensureIndexes(db);

  const signals = await listEnabledGmailSignals(db);
  stats.signals = signals.length;

  ingestLog("signals_loaded", {
    signalCount: signals.length,
    signals: signals.map((s) => ({
      id: s.id,
      name: s.name,
      vertical_id: s.vertical_id,
      enabled: s.enabled,
      email_address: s.config.email_address,
    })),
  });

  for (const signal of signals) {
    ingestLog("signal_begin", {
      signalId: signal.id,
      name: signal.name,
      vertical_id: signal.vertical_id,
      email_address: signal.config.email_address,
    });

    const vertical = await getVertical(db, signal.vertical_id);
    if (!vertical) {
      ingestLog("vertical_skip", { signalId: signal.id, reason: "vertical_not_found" });
      continue;
    }
    if (!vertical.active) {
      ingestLog("vertical_skip", { signalId: signal.id, reason: "vertical_inactive", verticalId: vertical.id });
      continue;
    }

    const oauth = await getGmailOAuth(db, signal.config.email_address);
    if (!oauth?.refresh_token) {
      ingestLog("oauth_skip", {
        signalId: signal.id,
        email_address: signal.config.email_address,
        hint: "check gmail_oauth collection for refresh_token",
      });
      console.warn(
        `[ingest] No OAuth token for ${signal.config.email_address}; connect Gmail first.`,
      );
      continue;
    }

    let gmail;
    try {
      gmail = createGmailClient(oauth.refresh_token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ingestLog("gmail_client_error", { signalId: signal.id, message: msg });
      if (verbose() && e instanceof Error && e.stack) {
        console.error("[ingest] Gmail client stack", e.stack);
      }
      continue;
    }

    const gmailQ = buildGmailQuery(signal.config);
    ingestLog("gmail_query", { signalId: signal.id, q: gmailQ });

    let ids: string[] = [];
    try {
      ids = await listMessageIds(gmail, signal.config, 80);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ingest] list messages failed", signal.id, e);
      ingestLog("list_messages_error", { signalId: signal.id, message: msg });
      continue;
    }

    ingestLog("gmail_list_result", {
      signalId: signal.id,
      idCount: ids.length,
      ...(verbose() && ids.length > 0 ? { sampleIds: ids.slice(0, 3) } : {}),
    });

    stats.messagesListed += ids.length;

    for (const messageId of ids) {
      try {
        if (verbose()) {
          ingestLog("message_begin", { signalId: signal.id, messageId });
        }

        const existing = await findSignalByExternalId(db, messageId);
        if (existing) {
          stats.skippedDuplicate++;
          if (verbose()) {
            ingestLog("message_skip", { messageId, reason: "duplicate" });
          }
          continue;
        }

        const normalized = await getNormalizedMessage(gmail, messageId);
        if (!normalized) {
          stats.skippedError++;
          if (verbose()) {
            ingestLog("message_skip", { messageId, reason: "normalize_failed" });
          }
          continue;
        }

        const pf = prefilter(normalized, vertical, signal, signal.config);
        if (verbose()) {
          ingestLog("prefilter", { messageId, ok: pf.ok, reason: pf.ok ? undefined : pf.reason });
        }

        if (!pf.ok) {
          const minimal = buildMinimalSignalItem(vertical, signal, normalized, pf.reason);
          try {
            await insertSignalItem(db, minimal);
            stats.storedMinimal++;
            if (verbose()) {
              ingestLog("insert_ok", { messageId, kind: "minimal", skipReason: pf.reason });
            }
          } catch (e: unknown) {
            const code = (e as { code?: number })?.code;
            if (code === 11000) {
              stats.skippedDuplicate++;
              if (verbose()) ingestLog("insert_skip", { messageId, reason: "duplicate_key_minimal" });
            } else {
              console.error("[ingest] insert minimal", e);
              stats.skippedError++;
              ingestLog("insert_error", {
                messageId,
                kind: "minimal",
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }
          continue;
        }

        let extracted = extractAndTruncate(normalized.raw_content, signal.config.scan_body);
        extracted = extracted.slice(0, env.maxAiInputChars);

        let summary = "";
        const aiSummaryOn = signal.config.ai_summary_enabled !== false;
        if (env.openaiApiKey && aiSummaryOn) {
          try {
            summary = await summarizeEmailBody(extracted);
          } catch (e) {
            console.error("[ingest] OpenAI failed", e);
          }
        }

        let dealLlm: DealMetricsLlmPartial | null = null;
        if (env.openaiApiKey) {
          try {
            dealLlm = await extractDealMetricsWithLlm(extracted);
          } catch (e) {
            console.error("[ingest] deal metrics LLM failed", e);
          }
        }
        const dealRegex = extractDealMetricsRegex(normalized.subject, extracted);
        const deal_metrics = mergeDealExtractions(dealLlm, dealRegex);

        const full = buildFullSignalItem(vertical, signal, normalized, extracted, summary, deal_metrics);
        try {
          await insertSignalItem(db, full);
          stats.storedFull++;
          if (verbose()) {
            ingestLog("insert_ok", { messageId, kind: "full" });
          }
        } catch (e: unknown) {
          const code = (e as { code?: number })?.code;
          if (code === 11000) {
            stats.skippedDuplicate++;
            if (verbose()) ingestLog("insert_skip", { messageId, reason: "duplicate_key_full" });
          } else {
            console.error("[ingest] insert full", e);
            stats.skippedError++;
            ingestLog("insert_error", {
              messageId,
              kind: "full",
              message: e instanceof Error ? e.message : String(e),
            });
          }
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
  }

  console.log("[ingest] stats", stats);
  ingestLog("ingest_done", { ...stats });
  return stats;
}
