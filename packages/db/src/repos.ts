import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import { shouldResetGmailRefreshTokenIssuedAt } from "./gmail-oauth.js";
import { migrateLegacyCollections } from "./migrate.js";
import type {
  ContentSignal,
  GmailOAuthDoc,
  GmailSourceConfig,
  SignalItem,
  SignalItemFeedRow,
  SignalItemPostDisplayRow,
  Source,
} from "./schemas.js";
import {
  contentSignalSchema,
  gmailSourceConfigSchema,
  signalItemFeedRowSchema,
  signalItemPostDisplayRowSchema,
  signalItemSchema,
  sourceDisplayLabel,
  sourceSchema,
} from "./schemas.js";
import { SOURCE_TYPE_EMAIL_GMAIL } from "./schemas.js";
import {
  buildExpiredSignalItemsFilter,
  lookbackCutoffDate,
  maxAgeExprFilter,
  contentSignalScopeFilter,
} from "./retention.js";

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

export async function listContentSignals(
  db: Db,
  opts?: { organizationId?: string; activeOnly?: boolean },
): Promise<ContentSignal[]> {
  const filter: Record<string, unknown> = {};
  if (opts?.organizationId) filter.organization_id = opts.organizationId;
  if (opts?.activeOnly) filter.active = true;
  const docs = await contentSignals(db).find(filter).sort({ name: 1 }).toArray();
  return docs.map((d) => contentSignalSchema.parse(d));
}

export async function getContentSignal(db: Db, id: string): Promise<ContentSignal | null> {
  const doc = await contentSignals(db).findOne({ id });
  return doc ? contentSignalSchema.parse(doc) : null;
}

export async function upsertContentSignal(
  db: Db,
  data: Omit<
    ContentSignal,
    "id" | "created_at" | "updated_at" | "last_ingest_completed_at" | "post_min_deal_pct" | "ingest_interval_minutes"
  > & {
    id?: string;
    organization_id: string;
    last_ingest_completed_at?: Date;
    post_min_deal_pct?: number;
    ingest_interval_minutes?: number | null;
  },
): Promise<ContentSignal> {
  const now = new Date();
  const id = data.id ?? randomUUID();
  const existing = await contentSignals(db).findOne({ id });
  const row: ContentSignal = {
    id,
    organization_id: data.organization_id,
    name: data.name,
    description: data.description ?? "",
    keywords: data.keywords ?? [],
    lookback_window_hours: data.lookback_window_hours ?? 168,
    deal_unit_tokens: data.deal_unit_tokens ?? [],
    active: data.active ?? true,
    post_min_deal_pct: data.post_min_deal_pct ?? existing?.post_min_deal_pct ?? 50,
    ingest_interval_minutes:
      data.ingest_interval_minutes !== undefined
        ? data.ingest_interval_minutes
        : (existing?.ingest_interval_minutes ?? null),
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
    {
      $set: { last_ingest_completed_at: at, updated_at: now },
      $unset: { last_ingest_error: "" },
    },
  );
}

export async function recordContentSignalIngestAttempt(
  db: Db,
  contentSignalId: string,
  data: { attemptedAt: Date; error: string | null },
): Promise<void> {
  const now = new Date();
  const set: Record<string, unknown> = {
    last_ingest_attempt_at: data.attemptedAt,
    updated_at: now,
  };
  if (data.error === null) {
    await contentSignals(db).updateOne(
      { id: contentSignalId },
      { $set: set, $unset: { last_ingest_error: "" } },
    );
    return;
  }
  set.last_ingest_error = data.error;
  await contentSignals(db).updateOne({ id: contentSignalId }, { $set: set });
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
  organizationId?: string;
  content_signal_id?: string;
  keyword?: string;
  min_score?: number;
  min_effective_savings_pct?: number;
  min_confidence?: number;
  has_deal_metrics?: boolean;
  max_age_hours?: number;
  sort: "created_at" | "relevance_score" | "deal_savings";
  order: "asc" | "desc";
  limit?: number;
};

/** Trim attachment metadata before excluding heavy feed fields. */
export const signalItemFeedTrimImagesStage = {
  $addFields: {
    email_images: {
      $cond: {
        if: { $gt: [{ $size: { $ifNull: ["$email_images", []] } }, 0] },
        then: {
          $map: {
            input: "$email_images",
            as: "img",
            in: {
              mime: "$$img.mime",
              filename: "$$img.filename",
            },
          },
        },
        else: "$$REMOVE",
      },
    },
  },
} as const;

/** Exclusion-only projection — must not mix computed fields with `field: 0`. */
export const signalItemFeedExcludeHeavyFieldsStage = {
  $project: {
    raw_content: 0,
    email_html_preview: 0,
  },
} as const;

export const signalItemFeedSlimStages = [
  signalItemFeedTrimImagesStage,
  signalItemFeedExcludeHeavyFieldsStage,
] as const;

/** Posts page: exclude raw email body fields but keep full attachment base64. */
export const signalItemPostDisplayStages = [signalItemFeedExcludeHeavyFieldsStage] as const;

function buildSignalFeedFilter(q: SignalFeedQuery): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];
  if (q.organizationId) {
    clauses.push({ organization_id: q.organizationId });
  }
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
    });
  }
  if (q.min_confidence !== undefined) {
    clauses.push({ "deal_metrics.confidence": { $gte: q.min_confidence } });
  }
  if (q.has_deal_metrics) {
    clauses.push({
      deal_metrics: { $exists: true, $ne: null },
      $or: [
        { "deal_metrics.effective_savings_pct": { $gt: 0 } },
        { "deal_metrics.bonus_pct": { $gt: 0 } },
      ],
    });
  }
  if (q.max_age_hours !== undefined) {
    clauses.push(maxAgeExprFilter(lookbackCutoffDate(q.max_age_hours)));
  }

  return clauses.length === 0
    ? {}
    : clauses.length === 1
      ? (clauses[0] as Record<string, unknown>)
      : { $and: clauses };
}

export async function listSignalItems(db: Db, q: SignalFeedQuery): Promise<SignalItem[]> {
  const filter = buildSignalFeedFilter(q);
  const limit = q.limit ?? 200;

  if (q.sort === "created_at") {
    const docs = await signalItems(db)
      .aggregate([
        { $match: filter },
        { $addFields: { _recency: { $ifNull: ["$email_sent_at", "$created_at"] } } },
        { $sort: { _recency: -1 } },
        { $limit: limit },
        { $project: { _recency: 0 } },
      ])
      .toArray();
    return docs.map((d) => signalItemSchema.parse(d));
  }

  const sort: Record<string, 1 | -1> =
    q.sort === "deal_savings"
      ? {
          "deal_metrics.effective_savings_pct": q.order === "asc" ? 1 : -1,
          created_at: -1,
        }
      : {
          relevance_score: q.order === "asc" ? 1 : -1,
          created_at: -1,
        };
  const cursor = signalItems(db).find(filter).sort(sort).limit(limit);
  const docs = await cursor.toArray();
  return docs.map((d) => signalItemSchema.parse(d));
}

/** Feed list rows without raw email, HTML preview, or attachment base64. */
export async function listSignalItemsForFeed(
  db: Db,
  q: SignalFeedQuery,
): Promise<SignalItemFeedRow[]> {
  const filter = buildSignalFeedFilter(q);
  const limit = q.limit ?? 200;

  if (q.sort === "created_at") {
    const docs = await signalItems(db)
      .aggregate([
        { $match: filter },
        { $addFields: { _recency: { $ifNull: ["$email_sent_at", "$created_at"] } } },
        { $sort: { _recency: -1 } },
        { $limit: limit },
        { $project: { _recency: 0 } },
        ...signalItemFeedSlimStages,
      ])
      .toArray();
    return docs.map((d) => signalItemFeedRowSchema.parse(d));
  }

  const sort: Record<string, 1 | -1> =
    q.sort === "deal_savings"
      ? {
          "deal_metrics.effective_savings_pct": q.order === "asc" ? 1 : -1,
          created_at: -1,
        }
      : {
          relevance_score: q.order === "asc" ? 1 : -1,
          created_at: -1,
        };

  const docs = await signalItems(db)
    .aggregate([{ $match: filter }, { $sort: sort }, { $limit: limit }, ...signalItemFeedSlimStages])
    .toArray();
  return docs.map((d) => signalItemFeedRowSchema.parse(d));
}

/** Signal items for posts sync — slim rows without raw email/HTML/base64. */
export const listSignalItemsForPostSync = listSignalItemsForFeed;

export async function getSignalItem(db: Db, id: string): Promise<SignalItem | null> {
  const doc = await signalItems(db).findOne({ id });
  return doc ? signalItemSchema.parse(doc) : null;
}

/** Batch-load slim feed rows (no raw email or image base64). */
export async function getSignalFeedRowsByIds(
  db: Db,
  organizationId: string,
  ids: string[],
): Promise<Map<string, SignalItemFeedRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();

  const docs = await signalItems(db)
    .aggregate([
      { $match: { organization_id: organizationId, id: { $in: unique } } },
      ...signalItemFeedSlimStages,
    ])
    .toArray();

  const map = new Map<string, SignalItemFeedRow>();
  for (const doc of docs) {
    const item = signalItemFeedRowSchema.parse(doc);
    map.set(item.id, item);
  }
  return map;
}

/** Batch-load post display rows with attachment base64 (no raw email body). */
export async function getSignalPostDisplayRowsByIds(
  db: Db,
  organizationId: string,
  ids: string[],
): Promise<Map<string, SignalItemPostDisplayRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();

  const docs = await signalItems(db)
    .aggregate([
      { $match: { organization_id: organizationId, id: { $in: unique } } },
      ...signalItemPostDisplayStages,
    ])
    .toArray();

  const map = new Map<string, SignalItemPostDisplayRow>();
  for (const doc of docs) {
    const item = signalItemPostDisplayRowSchema.parse(doc);
    map.set(item.id, item);
  }
  return map;
}

/** Batch-load feed rows for Posts page image join (keyed by signal item id). */
export async function getSignalItemsByIds(
  db: Db,
  organizationId: string,
  ids: string[],
): Promise<Map<string, SignalItem>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();

  const docs = await signalItems(db)
    .find({ organization_id: organizationId, id: { $in: unique } })
    .toArray();

  const map = new Map<string, SignalItem>();
  for (const doc of docs) {
    const item = signalItemSchema.parse(doc);
    map.set(item.id, item);
  }
  return map;
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

/** Insert or refresh a Gmail row by external_id (re-sync updates deal fields). */
export async function upsertSignalItem(db: Db, item: SignalItem): Promise<"inserted" | "updated"> {
  const parsed = signalItemSchema.parse(item);
  const result = await signalItems(db).replaceOne(
    { external_id: parsed.external_id },
    parsed as SignalItem,
    { upsert: true },
  );
  return result.upsertedCount > 0 ? "inserted" : "updated";
}

/** Delete feed rows older than lookback and archive linked draft posts. */
export async function purgeExpiredSignalItems(
  db: Db,
  contentSignalId: string,
  lookbackHours: number,
): Promise<{ deletedItems: number; archivedPosts: number }> {
  const expiredFilter = buildExpiredSignalItemsFilter(contentSignalId, lookbackHours);
  const expired = await signalItems(db).find(expiredFilter).project({ id: 1 }).toArray();
  const ids = expired.map((d) => d.id).filter(Boolean);
  if (ids.length === 0) {
    return { deletedItems: 0, archivedPosts: 0 };
  }

  const deleteResult = await signalItems(db).deleteMany({ id: { $in: ids } });
  const now = new Date();
  const postsResult = await db.collection(COLLECTIONS.posts).updateMany(
    { signal_item_id: { $in: ids }, status: "draft" },
    { $set: { status: "archived", updated_at: now } },
  );

  return {
    deletedItems: deleteResult.deletedCount,
    archivedPosts: postsResult.modifiedCount,
  };
}

/** Remove all feed rows for a content signal and reset ingest cursor for a full re-sync. */
export async function clearFeedForContentSignal(db: Db, contentSignalId: string): Promise<number> {
  const result = await signalItems(db).deleteMany(contentSignalScopeFilter(contentSignalId));
  const now = new Date();
  await contentSignals(db).updateOne(
    { id: contentSignalId },
    { $unset: { last_ingest_completed_at: "" }, $set: { updated_at: now } },
  );
  return result.deletedCount;
}

export async function saveGmailOAuth(
  db: Db,
  data: {
    email_address: string;
    refresh_token: string;
    access_token?: string;
    access_token_expiry?: Date;
    /** When true, sets refresh_token_issued_at to now (new refresh token from Google). */
    issuedNewRefreshToken?: boolean;
    /** When true, sets refresh_token_issued_at to now (user completed OAuth reconnect). */
    userReconnect?: boolean;
  },
): Promise<void> {
  const now = new Date();
  const existing = await getGmailOAuth(db, data.email_address);
  const set: Record<string, unknown> = {
    email_address: data.email_address,
    refresh_token: data.refresh_token,
    updated_at: now,
  };
  if (data.access_token !== undefined) set.access_token = data.access_token;
  if (data.access_token_expiry !== undefined) {
    set.access_token_expiry = data.access_token_expiry;
  }
  if (
    shouldResetGmailRefreshTokenIssuedAt({
      issuedNewRefreshToken: data.issuedNewRefreshToken,
      userReconnect: data.userReconnect,
      hasExistingIssuedAt: Boolean(existing?.refresh_token_issued_at),
    })
  ) {
    set.refresh_token_issued_at = now;
  }

  await gmailOAuth(db).updateOne(
    { email_address: data.email_address },
    { $set: set },
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
