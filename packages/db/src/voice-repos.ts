import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import type { BrandProfile } from "./brand-profile.js";
import type { Voice } from "./schemas.js";
import { voiceSchema } from "./schemas.js";

function voices(db: Db): Collection<Voice> {
  return db.collection<Voice>(COLLECTIONS.voices);
}

export type VoiceConfig = Omit<
  Voice,
  | "id"
  | "organization_id"
  | "created_by"
  | "created_at"
  | "updated_at"
  | "persona_status"
  | "persona_generated_at"
  | "persona_requested_at"
  | "brand_profile"
  | "corpus_hash"
  | "brand_profile_version"
> & {
  persona_status?: Voice["persona_status"];
  persona_generated_at?: Date;
  persona_requested_at?: Date;
  brand_profile?: BrandProfile;
  corpus_hash?: string;
  brand_profile_version?: number;
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
    brand_mention_level: data.brand_mention_level ?? 50,
    sources_in_posts_level: data.sources_in_posts_level ?? 0,
    website_url: data.website_url ?? "",
    rss_feed_url: data.rss_feed_url ?? "",
    social_links: data.social_links ?? [],
    keywords: data.keywords ?? [],
    preferred_phrases: data.preferred_phrases ?? [],
    content_signal_ids: data.content_signal_ids ?? [],
    distribution_platforms: data.distribution_platforms ?? [],
    persona: data.persona ?? "",
    persona_status: data.persona_status ?? existing?.persona_status ?? "pending",
    persona_error: data.persona_error ?? undefined,
    persona_generated_at: data.persona_generated_at ?? existing?.persona_generated_at,
    persona_requested_at: data.persona_requested_at ?? existing?.persona_requested_at,
    brand_profile: data.brand_profile ?? existing?.brand_profile,
    corpus_hash: data.corpus_hash ?? existing?.corpus_hash,
    brand_profile_version: data.brand_profile_version ?? existing?.brand_profile_version ?? 0,
    created_by: existing?.created_by ?? data.created_by,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const parsed = voiceSchema.parse(row);
  await voices(db).replaceOne({ id: parsed.id }, parsed, { upsert: true });
  return parsed;
}

export async function updateVoiceBrandProfile(
  db: Db,
  id: string,
  update: {
    brand_profile: BrandProfile;
    corpus_hash: string;
    brand_profile_version: number;
    persona: string;
    persona_status: Voice["persona_status"];
    persona_generated_at?: Date;
    persona_error?: string;
  },
): Promise<Voice | null> {
  const existing = await voices(db).findOne({ id });
  if (!existing) return null;
  const now = new Date();
  const row: Voice = voiceSchema.parse({
    ...existing,
    brand_profile: update.brand_profile,
    corpus_hash: update.corpus_hash,
    brand_profile_version: update.brand_profile_version,
    persona: update.persona,
    persona_status: update.persona_status,
    persona_error: update.persona_error ?? undefined,
    persona_generated_at: update.persona_generated_at ?? existing.persona_generated_at,
    updated_at: now,
  });
  await voices(db).replaceOne({ id }, row);
  return row;
}

export async function mergeVoiceBrandMemory(
  db: Db,
  voiceId: string,
  memoryPatch: Partial<BrandProfile["memory"]>,
): Promise<Voice | null> {
  const existing = await voices(db).findOne({ id: voiceId });
  if (!existing?.brand_profile) return null;

  const mergeList = (a: string[], b: string[] | undefined, max: number) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of [...a, ...(b ?? [])]) {
      const s = x.trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= max) break;
    }
    return out;
  };

  const mem = existing.brand_profile.memory;
  const merged = {
    favoritePhrases: mergeList(mem.favoritePhrases, memoryPatch.favoritePhrases, 20),
    recurringTopics: mergeList(mem.recurringTopics, memoryPatch.recurringTopics, 20),
    recurringJokes: mergeList(mem.recurringJokes, memoryPatch.recurringJokes, 20),
    recurringCTAs: mergeList(mem.recurringCTAs, memoryPatch.recurringCTAs, 20),
    recurringEnemies: mergeList(mem.recurringEnemies, memoryPatch.recurringEnemies, 20),
    favoriteOpenings: mergeList(mem.favoriteOpenings ?? [], memoryPatch.favoriteOpenings, 20),
    favoriteClosings: mergeList(mem.favoriteClosings ?? [], memoryPatch.favoriteClosings, 20),
    favoriteTransitions: mergeList(
      mem.favoriteTransitions ?? [],
      memoryPatch.favoriteTransitions,
      20,
    ),
    recurringOpinions: mergeList(mem.recurringOpinions ?? [], memoryPatch.recurringOpinions, 20),
    recurringWarnings: mergeList(mem.recurringWarnings ?? [], memoryPatch.recurringWarnings, 20),
    memoryUpdatedAt: new Date(),
  };

  const now = new Date();
  const row: Voice = voiceSchema.parse({
    ...existing,
    brand_profile: { ...existing.brand_profile, memory: merged },
    updated_at: now,
  });
  await voices(db).replaceOne({ id: voiceId }, row);
  return row;
}

export async function updateVoicePersonaStatus(
  db: Db,
  id: string,
  update: {
    persona?: string;
    persona_status: Voice["persona_status"];
    persona_error?: string;
    persona_generated_at?: Date;
    persona_requested_at?: Date;
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
    persona_requested_at: update.persona_requested_at ?? existing.persona_requested_at,
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
