import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import type { ContentSignal, DealMetrics, Post, PostSource, PostStatus } from "./schemas.js";
import { contentSignalSchema, postSchema } from "./schemas.js";

function posts(db: Db): Collection<Post> {
  return db.collection<Post>(COLLECTIONS.posts);
}

function contentSignals(db: Db): Collection<ContentSignal> {
  return db.collection<ContentSignal>(COLLECTIONS.content_signals);
}

export type PostListQuery = {
  organizationId: string;
  content_signal_id: string;
  status?: PostStatus;
  limit?: number;
};

export async function listPosts(db: Db, q: PostListQuery): Promise<Post[]> {
  const filter: Record<string, unknown> = {
    organization_id: q.organizationId,
    content_signal_id: q.content_signal_id,
    status: q.status ?? "draft",
  };
  const docs = await posts(db)
    .find(filter)
    .sort({ created_at: -1 })
    .limit(q.limit ?? 200)
    .toArray();
  return docs.map((d) => postSchema.parse(d));
}

export async function getPost(db: Db, id: string): Promise<Post | null> {
  const doc = await posts(db).findOne({ id });
  return doc ? postSchema.parse(doc) : null;
}

export async function findPostByItemDeal(
  db: Db,
  signalItemId: string,
  dealKey: string,
): Promise<Post | null> {
  const doc = await posts(db).findOne({ signal_item_id: signalItemId, deal_key: dealKey });
  return doc ? postSchema.parse(doc) : null;
}

export async function listPostsForSignalItem(db: Db, signalItemId: string): Promise<Post[]> {
  const docs = await posts(db).find({ signal_item_id: signalItemId }).toArray();
  return docs.map((d) => postSchema.parse(d));
}

export type UpsertPostData = {
  organization_id: string;
  content_signal_id: string;
  signal_item_id: string;
  deal_key: string;
  source: PostSource;
  title: string;
  social_copy: string;
  deal_metrics: DealMetrics;
  source_name: string;
  sender_from?: string;
  email_sent_at?: Date;
  ai_summary?: string | null;
};

export async function upsertPost(
  db: Db,
  data: UpsertPostData,
): Promise<{ post: Post; created: boolean }> {
  const now = new Date();
  const existing = await findPostByItemDeal(db, data.signal_item_id, data.deal_key);
  if (existing) {
    const updated: Post = postSchema.parse({
      ...existing,
      ...(data.source === "manual" ? { source: "manual" as const } : {}),
      status: "draft",
      title: data.title,
      social_copy: data.social_copy || existing.social_copy,
      deal_metrics: data.deal_metrics,
      source_name: data.source_name,
      sender_from: data.sender_from ?? existing.sender_from,
      email_sent_at: data.email_sent_at ?? existing.email_sent_at,
      ai_summary: data.ai_summary ?? existing.ai_summary,
      updated_at: now,
    });
    await posts(db).replaceOne({ id: existing.id }, updated);
    return { post: updated, created: false };
  }

  const row: Post = {
    id: randomUUID(),
    organization_id: data.organization_id,
    content_signal_id: data.content_signal_id,
    signal_item_id: data.signal_item_id,
    deal_key: data.deal_key,
    source: data.source,
    status: "draft",
    title: data.title,
    social_copy: data.social_copy,
    deal_metrics: data.deal_metrics,
    source_name: data.source_name,
    sender_from: data.sender_from ?? "",
    ...(data.email_sent_at ? { email_sent_at: data.email_sent_at } : {}),
    ...(data.ai_summary != null ? { ai_summary: data.ai_summary } : {}),
    created_at: now,
    updated_at: now,
  };
  const parsed = postSchema.parse(row);
  await posts(db).insertOne(parsed);
  return { post: parsed, created: true };
}

export async function archiveAutoPostsForSignal(
  db: Db,
  contentSignalId: string,
  keepKeys: Set<string>,
): Promise<number> {
  const now = new Date();
  const cursor = posts(db).find({
    content_signal_id: contentSignalId,
    source: "auto",
    status: "draft",
  });
  let count = 0;
  for await (const doc of cursor) {
    const key = `${doc.signal_item_id}:${doc.deal_key}`;
    if (!keepKeys.has(key)) {
      await posts(db).updateOne(
        { id: doc.id },
        { $set: { status: "archived", updated_at: now } },
      );
      count++;
    }
  }
  return count;
}

export async function archivePost(db: Db, id: string, organizationId: string): Promise<boolean> {
  const r = await posts(db).updateOne(
    { id, organization_id: organizationId },
    { $set: { status: "archived", updated_at: new Date() } },
  );
  return r.modifiedCount > 0;
}

export async function updateContentSignalPostSettings(
  db: Db,
  contentSignalId: string,
  settings: {
    post_min_deal_pct?: number;
    ingest_interval_minutes?: number | null;
  },
): Promise<ContentSignal | null> {
  const set: Record<string, unknown> = { updated_at: new Date() };
  if (settings.post_min_deal_pct !== undefined) {
    set.post_min_deal_pct = settings.post_min_deal_pct;
  }
  if (settings.ingest_interval_minutes !== undefined) {
    set.ingest_interval_minutes = settings.ingest_interval_minutes;
  }
  const doc = await contentSignals(db).findOneAndUpdate(
    { id: contentSignalId },
    { $set: set },
    { returnDocument: "after" },
  );
  return doc ? contentSignalSchema.parse(doc) : null;
}

export async function listScheduledContentSignals(db: Db): Promise<ContentSignal[]> {
  const docs = await contentSignals(db)
    .find({
      active: true,
      ingest_interval_minutes: { $ne: null, $gt: 0 },
    })
    .toArray();
  return docs.map((d) => contentSignalSchema.parse(d));
}

export function isContentSignalIngestDue(signal: ContentSignal, now = new Date()): boolean {
  const interval = signal.ingest_interval_minutes;
  if (interval == null || interval <= 0) return false;
  const last = signal.last_ingest_completed_at;
  if (!last || !Number.isFinite(last.getTime())) return true;
  const elapsedMs = now.getTime() - last.getTime();
  return elapsedMs >= interval * 60_000;
}
