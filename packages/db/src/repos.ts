import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import { migrateLegacyCollections } from "./migrate.js";
import type {
  ContentSignal,
  GmailOAuthDoc,
  GmailSourceConfig,
  SignalItem,
  Source,
} from "./schemas.js";
import {
  contentSignalSchema,
  gmailSourceConfigSchema,
  signalItemSchema,
  sourceDisplayLabel,
  sourceSchema,
} from "./schemas.js";
import { SOURCE_TYPE_EMAIL_GMAIL } from "./schemas.js";

function contentSignals(db: Db): Collection<ContentSignal> {
  return db.collection<ContentSignal>(COLLECTIONS.content_signals);
}

function sources(db: Db): Collection<Source> {
  return db.collection<Source>(COLLECTIONS.sources);
}

function signalItems(db: Db): Collection<SignalItem> {
  return db.collection<SignalItem>(COLLECTIONS.signal_items);
}

function gmailOAuth(db: Db): Collection<GmailOAuthDoc> {
  return db.collection<GmailOAuthDoc>(COLLECTIONS.gmail_oauth);
}

export async function listContentSignals(db: Db, activeOnly = false): Promise<ContentSignal[]> {
  const filter = activeOnly ? { active: true } : {};
  const docs = await contentSignals(db).find(filter).sort({ name: 1 }).toArray();
  return docs.map((d) => contentSignalSchema.parse(d));
}

export async function getContentSignal(db: Db, id: string): Promise<ContentSignal | null> {
  const doc = await contentSignals(db).findOne({ id });
  return doc ? contentSignalSchema.parse(doc) : null;
}

export async function upsertContentSignal(
  db: Db,
  data: Omit<ContentSignal, "id" | "created_at" | "updated_at" | "last_ingest_completed_at"> & {
    id?: string;
    last_ingest_completed_at?: Date;
  },
): Promise<ContentSignal> {
  const now = new Date();
  const id = data.id ?? randomUUID();
  const existing = await contentSignals(db).findOne({ id });
  const row: ContentSignal = {
    id,
    name: data.name,
    description: data.description ?? "",
    keywords: data.keywords ?? [],
    lookback_window_hours: data.lookback_window_hours ?? 168,
    deal_unit_tokens: data.deal_unit_tokens ?? [],
    active: data.active ?? true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    ...(existing?.last_ingest_completed_at != null
      ? { last_ingest_completed_at: existing.last_ingest_completed_at }
      : {}),
    ...(data.last_ingest_completed_at != null
      ? { last_ingest_completed_at: data.last_ingest_completed_at }
      : {}),
  };
  const parsed = contentSignalSchema.parse(row);
  await contentSignals(db).replaceOne({ id: parsed.id }, parsed, { upsert: true });
  return parsed;
}

export async function deleteContentSignal(db: Db, id: string): Promise<boolean> {
  const r = await contentSignals(db).deleteOne({ id });
  await sources(db).deleteMany({ content_signal_id: id });
  await signalItems(db).deleteMany({ content_signal_id: id });
  return r.deletedCount > 0;
}

export async function touchContentSignalLastIngest(
  db: Db,
  contentSignalId: string,
  at: Date,
): Promise<void> {
  const now = new Date();
  await contentSignals(db).updateOne(
    { id: contentSignalId },
    { $set: { last_ingest_completed_at: at, updated_at: now } },
  );
}

export async function listSourcesByContentSignal(db: Db, contentSignalId: string): Promise<Source[]> {
  const docs = await sources(db).find({ content_signal_id: contentSignalId }).sort({ created_at: 1 }).toArray();
  return docs.map((d) => sourceSchema.parse(d));
}

export async function listSources(db: Db, contentSignalId?: string): Promise<Source[]> {
  const filter = contentSignalId ? { content_signal_id: contentSignalId } : {};
  const docs = await sources(db).find(filter).sort({ created_at: 1 }).toArray();
  return docs.map((d) => sourceSchema.parse(d));
}

export async function listEnabledSources(
  db: Db,
  contentSignalId?: string,
): Promise<Source[]> {
  const filter: Record<string, unknown> = {
    enabled: true,
    source_type: SOURCE_TYPE_EMAIL_GMAIL,
  };
  if (contentSignalId) filter.content_signal_id = contentSignalId;
  const docs = await sources(db).find(filter).toArray();
  return docs.map((d) => sourceSchema.parse(d));
}

export async function getSource(db: Db, id: string): Promise<Source | null> {
  const doc = await sources(db).findOne({ id });
  return doc ? sourceSchema.parse(doc) : null;
}

export async function upsertSource(
  db: Db,
  data: {
    id?: string;
    content_signal_id: string;
    enabled?: boolean;
    config: unknown;
  },
): Promise<Source> {
  const now = new Date();
  const id = data.id ?? randomUUID();
  const config = gmailSourceConfigSchema.parse(data.config);
  const existing = await sources(db).findOne({ id });
  const row: Source = {
    id,
    content_signal_id: data.content_signal_id,
    source_type: SOURCE_TYPE_EMAIL_GMAIL,
    enabled: data.enabled ?? true,
    config,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const parsed = sourceSchema.parse(row);
  await sources(db).replaceOne({ id: parsed.id }, parsed, { upsert: true });
  return parsed;
}

export async function deleteSource(db: Db, id: string): Promise<boolean> {
  const r = await sources(db).deleteOne({ id });
  await signalItems(db).deleteMany({ source_id: id });
  return r.deletedCount > 0;
}

export type SignalFeedQuery = {
  content_signal_id?: string;
  keyword?: string;
  min_score?: number;
  min_effective_savings_pct?: number;
  min_confidence?: number;
  has_deal_metrics?: boolean;
  sort: "created_at" | "relevance_score" | "deal_savings";
  order: "asc" | "desc";
  limit?: number;
};

export async function listSignalItems(db: Db, q: SignalFeedQuery): Promise<SignalItem[]> {
  const clauses: Record<string, unknown>[] = [];
  if (q.content_signal_id) {
    clauses.push({
      $or: [
        { content_signal_id: q.content_signal_id },
        { vertical_id: q.content_signal_id },
      ],
    });
  }
  if (q.min_score !== undefined) clauses.push({ relevance_score: { $gte: q.min_score } });
  if (q.keyword) {
    const kw = escapeRegex(q.keyword);
    clauses.push({
      $or: [
        { title: { $regex: kw, $options: "i" } },
        { extracted_text: { $regex: kw, $options: "i" } },
        { detected_keywords: { $regex: kw, $options: "i" } },
      ],
    });
  }
  if (q.min_effective_savings_pct !== undefined) {
    const min = q.min_effective_savings_pct;
    clauses.push({
      $and: [
        {
          $or: [
            { "deal_metrics.units_comparable": true },
            {
              "deal_metrics.units_comparable": { $exists: false },
              "deal_metrics.mode": "retail_list_vs_sale",
            },
          ],
        },
        {
          $expr: {
            $gte: [
              {
                $max: [
                  { $ifNull: ["$deal_metrics.effective_savings_pct", 0] },
                  { $ifNull: ["$deal_metrics.bonus_pct", 0] },
                ],
              },
              min,
            ],
          },
        },
      ],
    });
  }
  if (q.min_confidence !== undefined) {
    clauses.push({ "deal_metrics.confidence": { $gte: q.min_confidence } });
  }
  if (q.has_deal_metrics) {
    clauses.push({
      deal_metrics: { $exists: true, $ne: null },
      "deal_metrics.effective_savings_pct": { $exists: true },
    });
  }

  const filter: Record<string, unknown> =
    clauses.length === 0 ? {} : clauses.length === 1 ? (clauses[0] as Record<string, unknown>) : { $and: clauses };

  const sortField =
    q.sort === "deal_savings"
      ? "deal_metrics.effective_savings_pct"
      : q.sort === "relevance_score"
        ? "relevance_score"
        : "created_at";
  const sort: Record<string, 1 | -1> = {
    [sortField]: q.order === "asc" ? 1 : -1,
  };
  const cursor = signalItems(db).find(filter).sort(sort).limit(q.limit ?? 200);
  const docs = await cursor.toArray();
  return docs.map((d) => signalItemSchema.parse(d));
}

export async function getSignalItem(db: Db, id: string): Promise<SignalItem | null> {
  const doc = await signalItems(db).findOne({ id });
  return doc ? signalItemSchema.parse(doc) : null;
}

export async function findSignalByExternalId(
  db: Db,
  externalId: string,
): Promise<SignalItem | null> {
  const doc = await signalItems(db).findOne({ external_id: externalId });
  return doc ? signalItemSchema.parse(doc) : null;
}

export async function insertSignalItem(db: Db, item: SignalItem): Promise<void> {
  const parsed = signalItemSchema.parse(item);
  await signalItems(db).insertOne(parsed as SignalItem);
}

/** Remove all feed rows for a content signal and reset ingest cursor for a full re-sync. */
export async function clearFeedForContentSignal(db: Db, contentSignalId: string): Promise<number> {
  const result = await signalItems(db).deleteMany({
    $or: [{ content_signal_id: contentSignalId }, { vertical_id: contentSignalId }],
  });
  const now = new Date();
  await contentSignals(db).updateOne(
    { id: contentSignalId },
    { $unset: { last_ingest_completed_at: "" }, $set: { updated_at: now } },
  );
  return result.deletedCount;
}

export async function saveGmailOAuth(
  db: Db,
  data: { email_address: string; refresh_token: string; access_token?: string; access_token_expiry?: Date },
): Promise<void> {
  const now = new Date();
  await gmailOAuth(db).replaceOne(
    { email_address: data.email_address },
    {
      email_address: data.email_address,
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      access_token_expiry: data.access_token_expiry,
      updated_at: now,
    },
    { upsert: true },
  );
  await setGmailOAuthIngestError(db, data.email_address, null);
}

export async function setGmailOAuthIngestError(
  db: Db,
  email: string,
  error: string | null,
): Promise<void> {
  const now = new Date();
  if (error === null) {
    await gmailOAuth(db).updateOne(
      { email_address: email },
      { $unset: { last_ingest_error: "", last_ingest_error_at: "" }, $set: { updated_at: now } },
    );
    return;
  }
  await gmailOAuth(db).updateOne(
    { email_address: email },
    { $set: { last_ingest_error: error, last_ingest_error_at: now, updated_at: now } },
  );
}

export async function getGmailOAuth(
  db: Db,
  email: string,
): Promise<GmailOAuthDoc | null> {
  const doc = await gmailOAuth(db).findOne({ email_address: email });
  return doc ?? null;
}

export async function getAnyGmailOAuth(db: Db): Promise<GmailOAuthDoc | null> {
  return (await gmailOAuth(db).findOne({})) ?? null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { SOURCE_TYPE_EMAIL_GMAIL, gmailSourceConfigSchema, sourceDisplayLabel };
export type { GmailSourceConfig };
