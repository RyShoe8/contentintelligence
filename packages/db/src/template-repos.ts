import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import type { ContentSignal, ContentSignalTemplate } from "./schemas.js";
import { contentSignalTemplateSchema } from "./schemas.js";

function templates(db: Db): Collection<ContentSignalTemplate> {
  return db.collection<ContentSignalTemplate>(COLLECTIONS.content_signal_templates);
}

export type ContentSignalTemplateConfig = Omit<
  ContentSignalTemplate,
  "id" | "organization_id" | "created_by" | "created_at" | "updated_at"
>;

/** Map a live content signal into template fields (no sources or ingest state). */
export function contentSignalToTemplatePayload(
  signal: ContentSignal,
  templateName: string,
  createdBy: string,
): ContentSignalTemplateConfig {
  return {
    name: templateName.trim(),
    description: signal.description ?? "",
    keywords: signal.keywords ?? [],
    lookback_window_hours: signal.lookback_window_hours,
    deal_unit_tokens: signal.deal_unit_tokens ?? [],
    active: signal.active,
    post_min_deal_pct: signal.post_min_deal_pct ?? 50,
    ingest_interval_minutes: signal.ingest_interval_minutes ?? null,
  };
}

export async function listContentSignalTemplates(
  db: Db,
  organizationId: string,
): Promise<ContentSignalTemplate[]> {
  const docs = await templates(db).find({ organization_id: organizationId }).sort({ name: 1 }).toArray();
  return docs.map((d) => contentSignalTemplateSchema.parse(d));
}

export async function getContentSignalTemplate(
  db: Db,
  id: string,
): Promise<ContentSignalTemplate | null> {
  const doc = await templates(db).findOne({ id });
  return doc ? contentSignalTemplateSchema.parse(doc) : null;
}

export async function upsertContentSignalTemplate(
  db: Db,
  data: ContentSignalTemplateConfig & {
    id?: string;
    organization_id: string;
    created_by: string;
  },
): Promise<ContentSignalTemplate> {
  const now = new Date();
  const id = data.id ?? randomUUID();
  const existing = await templates(db).findOne({ id });
  const row: ContentSignalTemplate = {
    id,
    organization_id: data.organization_id,
    name: data.name,
    description: data.description ?? "",
    keywords: data.keywords ?? [],
    lookback_window_hours: data.lookback_window_hours ?? 168,
    deal_unit_tokens: data.deal_unit_tokens ?? [],
    active: data.active ?? true,
    post_min_deal_pct: data.post_min_deal_pct ?? 50,
    ingest_interval_minutes: data.ingest_interval_minutes ?? null,
    created_by: existing?.created_by ?? data.created_by,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const parsed = contentSignalTemplateSchema.parse(row);
  await templates(db).replaceOne({ id: parsed.id }, parsed, { upsert: true });
  return parsed;
}

export async function deleteContentSignalTemplate(db: Db, id: string): Promise<boolean> {
  const r = await templates(db).deleteOne({ id });
  return r.deletedCount > 0;
}
