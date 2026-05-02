import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import type {
  GmailInputConfig,
  GmailOAuthDoc,
  InputSignal,
  SignalItem,
  Vertical,
} from "./schemas.js";
import {
  gmailInputConfigSchema,
  inputSignalSchema,
  signalItemSchema,
  verticalSchema,
} from "./schemas.js";
import { SOURCE_TYPE_EMAIL_GMAIL } from "./schemas.js";

function verticals(db: Db): Collection<Vertical> {
  return db.collection<Vertical>(COLLECTIONS.verticals);
}

function inputSignals(db: Db): Collection<InputSignal> {
  return db.collection<InputSignal>(COLLECTIONS.input_signals);
}

function signalItems(db: Db): Collection<SignalItem> {
  return db.collection<SignalItem>(COLLECTIONS.signal_items);
}

function gmailOAuth(db: Db): Collection<GmailOAuthDoc> {
  return db.collection<GmailOAuthDoc>(COLLECTIONS.gmail_oauth);
}

export async function listVerticals(db: Db, activeOnly = false): Promise<Vertical[]> {
  const filter = activeOnly ? { active: true } : {};
  const docs = await verticals(db).find(filter).sort({ name: 1 }).toArray();
  return docs.map((d) => verticalSchema.parse(d));
}

export async function getVertical(db: Db, id: string): Promise<Vertical | null> {
  const doc = await verticals(db).findOne({ id });
  return doc ? verticalSchema.parse(doc) : null;
}

export async function upsertVertical(
  db: Db,
  data: Omit<Vertical, "id" | "created_at" | "updated_at"> & { id?: string },
): Promise<Vertical> {
  const now = new Date();
  const id = data.id ?? randomUUID();
  const existing = await verticals(db).findOne({ id });
  const row: Vertical = {
    id,
    name: data.name,
    description: data.description ?? "",
    default_keywords: data.default_keywords ?? [],
    active: data.active ?? true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const parsed = verticalSchema.parse(row);
  await verticals(db).replaceOne({ id: parsed.id }, parsed, { upsert: true });
  return parsed;
}

export async function deleteVertical(db: Db, id: string): Promise<boolean> {
  const r = await verticals(db).deleteOne({ id });
  await inputSignals(db).deleteMany({ vertical_id: id });
  await signalItems(db).deleteMany({ vertical_id: id });
  return r.deletedCount > 0;
}

export async function listInputSignals(
  db: Db,
  verticalId?: string,
): Promise<InputSignal[]> {
  const filter = verticalId ? { vertical_id: verticalId } : {};
  const docs = await inputSignals(db).find(filter).sort({ name: 1 }).toArray();
  return docs.map((d) => inputSignalSchema.parse(d));
}

export async function listEnabledGmailSignals(db: Db): Promise<InputSignal[]> {
  const docs = await inputSignals(db)
    .find({ enabled: true, source_type: SOURCE_TYPE_EMAIL_GMAIL })
    .toArray();
  return docs.map((d) => inputSignalSchema.parse(d));
}

export async function getInputSignal(db: Db, id: string): Promise<InputSignal | null> {
  const doc = await inputSignals(db).findOne({ id });
  return doc ? inputSignalSchema.parse(doc) : null;
}

export async function upsertInputSignal(
  db: Db,
  data: {
    id?: string;
    vertical_id: string;
    name: string;
    enabled?: boolean;
    keywords?: string[];
    config: unknown;
  },
): Promise<InputSignal> {
  const now = new Date();
  const id = data.id ?? randomUUID();
  const config = gmailInputConfigSchema.parse(data.config);
  const existing = await inputSignals(db).findOne({ id });
  const row: InputSignal = {
    id,
    vertical_id: data.vertical_id,
    source_type: SOURCE_TYPE_EMAIL_GMAIL,
    name: data.name,
    enabled: data.enabled ?? true,
    keywords: data.keywords ?? [],
    config,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const parsed = inputSignalSchema.parse(row);
  await inputSignals(db).replaceOne({ id: parsed.id }, parsed, { upsert: true });
  return parsed;
}

export async function deleteInputSignal(db: Db, id: string): Promise<boolean> {
  const r = await inputSignals(db).deleteOne({ id });
  await signalItems(db).deleteMany({ input_signal_id: id });
  return r.deletedCount > 0;
}

export type SignalFeedQuery = {
  vertical_id?: string;
  keyword?: string;
  min_score?: number;
  /** Minimum deal strength 0–1 (matches `deal_metrics.effective_savings_pct`). */
  min_effective_savings_pct?: number;
  /** Minimum extraction confidence 0–1. */
  min_confidence?: number;
  /** When true, only rows with `deal_metrics` present. */
  has_deal_metrics?: boolean;
  sort: "created_at" | "relevance_score" | "deal_savings";
  order: "asc" | "desc";
  limit?: number;
};

export async function listSignalItems(db: Db, q: SignalFeedQuery): Promise<SignalItem[]> {
  const clauses: Record<string, unknown>[] = [];
  if (q.vertical_id) clauses.push({ vertical_id: q.vertical_id });
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
    clauses.push({ "deal_metrics.effective_savings_pct": { $gte: q.min_effective_savings_pct } });
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
    q.sort === "deal_savings" ? "deal_metrics.effective_savings_pct" : q.sort === "relevance_score" ? "relevance_score" : "created_at";
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

export { SOURCE_TYPE_EMAIL_GMAIL, gmailInputConfigSchema };
export type { GmailInputConfig };
