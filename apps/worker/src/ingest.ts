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
import {
  buildFullSignalItem,
  buildMinimalSignalItem,
  extractAndTruncate,
  prefilter,
} from "./pipeline.js";
import { summarizeEmailBody } from "./summarize.js";

export type IngestStats = {
  signals: number;
  messagesListed: number;
  skippedDuplicate: number;
  skippedError: number;
  storedMinimal: number;
  storedFull: number;
};

export async function runIngest(): Promise<IngestStats> {
  const stats: IngestStats = {
    signals: 0,
    messagesListed: 0,
    skippedDuplicate: 0,
    skippedError: 0,
    storedMinimal: 0,
    storedFull: 0,
  };

  if (!env.mongodbUri) {
    throw new Error("MONGODB_URI is not set");
  }

  const db = await getDb(env.mongodbUri);
  await ensureIndexes(db);

  const signals = await listEnabledGmailSignals(db);
  stats.signals = signals.length;

  for (const signal of signals) {
    const vertical = await getVertical(db, signal.vertical_id);
    if (!vertical?.active) continue;

    const oauth = await getGmailOAuth(db, signal.config.email_address);
    if (!oauth?.refresh_token) {
      console.warn(
        `[ingest] No OAuth token for ${signal.config.email_address}; connect Gmail first.`,
      );
      continue;
    }

    let gmail;
    try {
      gmail = createGmailClient(oauth.refresh_token);
    } catch (e) {
      console.error("[ingest] Gmail client error", e);
      continue;
    }

    let ids: string[] = [];
    try {
      ids = await listMessageIds(gmail, signal.config, 80);
    } catch (e) {
      console.error("[ingest] list messages failed", signal.id, e);
      continue;
    }
    stats.messagesListed += ids.length;

    for (const messageId of ids) {
      try {
        const existing = await findSignalByExternalId(db, messageId);
        if (existing) {
          stats.skippedDuplicate++;
          continue;
        }

        const normalized = await getNormalizedMessage(gmail, messageId);
        if (!normalized) {
          stats.skippedError++;
          continue;
        }

        const pf = prefilter(normalized, vertical, signal, signal.config);
        if (!pf.ok) {
          const minimal = buildMinimalSignalItem(vertical, signal, normalized, pf.reason);
          try {
            await insertSignalItem(db, minimal);
            stats.storedMinimal++;
          } catch (e: unknown) {
            const code = (e as { code?: number })?.code;
            if (code === 11000) stats.skippedDuplicate++;
            else {
              console.error("[ingest] insert minimal", e);
              stats.skippedError++;
            }
          }
          continue;
        }

        let extracted = extractAndTruncate(normalized.raw_content, signal.config.scan_body);
        extracted = extracted.slice(0, env.maxAiInputChars);

        let summary = "";
        if (env.openaiApiKey) {
          try {
            summary = await summarizeEmailBody(extracted);
          } catch (e) {
            console.error("[ingest] OpenAI failed", e);
          }
        }

        const full = buildFullSignalItem(vertical, signal, normalized, extracted, summary);
        try {
          await insertSignalItem(db, full);
          stats.storedFull++;
        } catch (e: unknown) {
          const code = (e as { code?: number })?.code;
          if (code === 11000) stats.skippedDuplicate++;
          else {
            console.error("[ingest] insert full", e);
            stats.skippedError++;
          }
        }
      } catch (e) {
        console.error("[ingest] message error", messageId, e);
        stats.skippedError++;
      }
    }
  }

  console.log("[ingest] stats", stats);
  return stats;
}
