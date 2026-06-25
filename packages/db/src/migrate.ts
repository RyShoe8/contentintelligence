import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";
import { SOURCE_TYPE_EMAIL_GMAIL } from "./schemas.js";

type LegacyVertical = {
  id: string;
  name: string;
  description?: string;
  default_keywords?: string[];
  active?: boolean;
  created_at?: Date;
  updated_at?: Date;
};

type LegacyInputSignal = {
  id: string;
  vertical_id: string;
  source_type: string;
  name?: string;
  enabled?: boolean;
  keywords?: string[];
  config: {
    email_address?: string;
    labels?: string[];
    sender_addresses?: string[];
    sender_domains?: string[];
    subject_keywords?: string[];
    scan_body?: boolean;
    ai_summary_enabled?: boolean;
    lookback_window_hours?: number;
    deal_unit_tokens?: string[];
  };
  last_ingest_completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * One-time migration from verticals/input_signals to content_signals/sources.
 * Safe to run repeatedly (skips when legacy collections are empty).
 */
export async function migrateLegacyCollections(db: Db): Promise<{ migrated: boolean }> {
  const legacyVerticals = db.collection<LegacyVertical>(COLLECTIONS.verticals);
  const legacySignals = db.collection<LegacyInputSignal>(COLLECTIONS.input_signals);
  const verticalCount = await legacyVerticals.countDocuments();
  const signalCount = await legacySignals.countDocuments();
  if (verticalCount === 0 && signalCount === 0) {
    return { migrated: false };
  }

  const contentSignals = db.collection(COLLECTIONS.content_signals);
  const sources = db.collection(COLLECTIONS.sources);
  const signalItems = db.collection(COLLECTIONS.signal_items);

  const verticals = await legacyVerticals.find().toArray();
  const signalsByVertical = new Map<string, LegacyInputSignal[]>();
  for (const s of await legacySignals.find().toArray()) {
    const list = signalsByVertical.get(s.vertical_id) ?? [];
    list.push(s);
    signalsByVertical.set(s.vertical_id, list);
  }

  for (const v of verticals) {
    const children = signalsByVertical.get(v.id) ?? [];
    const first = children[0];
    const mergedKeywords = new Set<string>();
    for (const k of v.default_keywords ?? []) {
      if (k.trim()) mergedKeywords.add(k.trim());
    }
    for (const child of children) {
      for (const k of child.keywords ?? []) {
        if (k.trim()) mergedKeywords.add(k.trim());
      }
    }
    let lookback = 168;
    let dealTokens: string[] = [];
    let lastIngest: Date | undefined;
    for (const child of children) {
      const cfg = child.config ?? {};
      if (cfg.lookback_window_hours && cfg.lookback_window_hours > 0) {
        lookback = cfg.lookback_window_hours;
      }
      if (cfg.deal_unit_tokens?.length) dealTokens = cfg.deal_unit_tokens;
      if (child.last_ingest_completed_at) {
        if (!lastIngest || child.last_ingest_completed_at > lastIngest) {
          lastIngest = child.last_ingest_completed_at;
        }
      }
    }
    if (first?.config?.lookback_window_hours) lookback = first.config.lookback_window_hours;
    if (first?.config?.deal_unit_tokens?.length) dealTokens = first.config.deal_unit_tokens;

    await contentSignals.replaceOne(
      { id: v.id },
      {
        id: v.id,
        name: v.name,
        description: v.description ?? "",
        keywords: [...mergedKeywords],
        lookback_window_hours: lookback,
        deal_unit_tokens: dealTokens,
        active: v.active ?? true,
        ...(lastIngest ? { last_ingest_completed_at: lastIngest } : {}),
        created_at: v.created_at ?? new Date(),
        updated_at: v.updated_at ?? new Date(),
      },
      { upsert: true },
    );
  }

  for (const s of await legacySignals.find().toArray()) {
    const cfg = s.config ?? {};
    await sources.replaceOne(
      { id: s.id },
      {
        id: s.id,
        content_signal_id: s.vertical_id,
        source_type: SOURCE_TYPE_EMAIL_GMAIL,
        enabled: s.enabled ?? true,
        config: {
          email_address: cfg.email_address ?? "",
          labels: cfg.labels,
          sender_addresses: cfg.sender_addresses,
          sender_domains: cfg.sender_domains,
          scan_body: cfg.scan_body ?? true,
          ai_summary_enabled: cfg.ai_summary_enabled ?? true,
        },
        created_at: s.created_at ?? new Date(),
        updated_at: s.updated_at ?? new Date(),
      },
      { upsert: true },
    );
  }

  await signalItems.updateMany(
    { vertical_id: { $exists: true } },
    [{ $set: { content_signal_id: "$vertical_id", source_id: "$input_signal_id" } }],
  );
  await signalItems.updateMany(
    { vertical_id: { $exists: true } },
    { $unset: { vertical_id: "", input_signal_id: "" } },
  );

  await legacySignals.deleteMany({});
  await legacyVerticals.deleteMany({});

  return { migrated: true };
}

/** Promote legacy draft rows so existing articles stay visible after saved-only sidebar filtering. */
const WRITER_DRAFTS_TO_SAVED_MIGRATION_ID = "writer_drafts_to_saved_v1";

export async function migrateWriterDraftsToSaved(db: Db): Promise<void> {
  const migrations = db.collection("_migrations");
  const done = await migrations.findOne({ id: WRITER_DRAFTS_TO_SAVED_MIGRATION_ID, done: true });
  if (done) return;

  await db.collection(COLLECTIONS.writer_articles).updateMany(
    { status: "draft" },
    { $set: { status: "saved" } },
  );

  await migrations.updateOne(
    { id: WRITER_DRAFTS_TO_SAVED_MIGRATION_ID },
    { $set: { id: WRITER_DRAFTS_TO_SAVED_MIGRATION_ID, done: true, completed_at: new Date() } },
    { upsert: true },
  );
}
