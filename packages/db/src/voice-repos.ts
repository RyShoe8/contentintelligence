import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import type { Voice } from "./schemas.js";
import { voiceSchema } from "./schemas.js";

function voices(db: Db): Collection<Voice> {
  return db.collection<Voice>(COLLECTIONS.voices);
}

export type VoiceConfig = Omit<
  Voice,
  "id" | "organization_id" | "created_by" | "created_at" | "updated_at" | "persona_status" | "persona_generated_at"
> & {
  persona_status?: Voice["persona_status"];
  persona_generated_at?: Date;
};

export async function listVoices(db: Db, organizationId: string): Promise<Voice[]> {
  const docs = await voices(db).find({ organization_id: organizationId }).sort({ name: 1 }).toArray();
  return docs.map((d) => voiceSchema.parse(d));
}

export async function getVoice(db: Db, id: string): Promise<Voice | null> {
  const doc = await voices(db).findOne({ id });
  return doc ? voiceSchema.parse(doc) : null;
}

export async function findVoiceForContentSignal(
  db: Db,
  contentSignalId: string,
): Promise<Voice | null> {
  const doc = await voices(db).findOne({ content_signal_ids: contentSignalId });
  return doc ? voiceSchema.parse(doc) : null;
}

export async function upsertVoice(
  db: Db,
  data: VoiceConfig & {
    id?: string;
    organization_id: string;
    created_by: string;
  },
): Promise<Voice> {
  const now = new Date();
  const id = data.id ?? randomUUID();
  const existing = await voices(db).findOne({ id });
  const row: Voice = {
    id,
    organization_id: data.organization_id,
    name: data.name,
    website_url: data.website_url ?? "",
    rss_feed_url: data.rss_feed_url ?? "",
    social_links: data.social_links ?? [],
    keywords: data.keywords ?? [],
    content_signal_ids: data.content_signal_ids ?? [],
    persona: data.persona ?? "",
    persona_status: data.persona_status ?? existing?.persona_status ?? "pending",
    persona_error: data.persona_error ?? undefined,
    persona_generated_at: data.persona_generated_at ?? existing?.persona_generated_at,
    created_by: existing?.created_by ?? data.created_by,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const parsed = voiceSchema.parse(row);
  await voices(db).replaceOne({ id: parsed.id }, parsed, { upsert: true });
  return parsed;
}

export async function updateVoicePersonaStatus(
  db: Db,
  id: string,
  update: {
    persona?: string;
    persona_status: Voice["persona_status"];
    persona_error?: string;
    persona_generated_at?: Date;
  },
): Promise<Voice | null> {
  const existing = await voices(db).findOne({ id });
  if (!existing) return null;
  const now = new Date();
  const row: Voice = voiceSchema.parse({
    ...existing,
    persona: update.persona ?? existing.persona,
    persona_status: update.persona_status,
    persona_error: update.persona_error ?? undefined,
    persona_generated_at: update.persona_generated_at ?? existing.persona_generated_at,
    updated_at: now,
  });
  await voices(db).replaceOne({ id }, row);
  return row;
}

export async function linkVoiceToSignals(
  db: Db,
  voiceId: string,
  organizationId: string,
  signalIds: string[],
): Promise<Voice | null> {
  const voice = await getVoice(db, voiceId);
  if (!voice || voice.organization_id !== organizationId) return null;

  const uniqueIds = [...new Set(signalIds.filter(Boolean))];

  await voices(db).updateMany(
    {
      organization_id: organizationId,
      id: { $ne: voiceId },
      content_signal_ids: { $in: uniqueIds },
    },
    {
      $pullAll: { content_signal_ids: uniqueIds },
    },
  );

  return upsertVoice(db, {
    ...voice,
    content_signal_ids: uniqueIds,
    organization_id: organizationId,
    created_by: voice.created_by,
  });
}

export async function deleteVoice(db: Db, id: string): Promise<boolean> {
  const r = await voices(db).deleteOne({ id });
  return r.deletedCount > 0;
}
