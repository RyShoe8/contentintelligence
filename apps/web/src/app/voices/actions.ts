"use server";

import {
  deleteVoice,
  ensureIndexes,
  getContentSignal,
  getVoice,
  linkVoiceToSignals,
  upsertVoice,
  type Voice,
} from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";
import { canAccessContentSignal, requireOrgMember } from "@/lib/org-auth";

function splitLines(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isHttpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

function parseSocialLinks(raw: string): { label?: string; url: string }[] {
  const lines = splitLines(raw);
  const out: { label?: string; url: string }[] = [];
  for (const line of lines) {
    if (out.length >= 10) break;
    const pipe = line.indexOf("|");
    if (pipe > 0) {
      const label = line.slice(0, pipe).trim();
      const url = line.slice(pipe + 1).trim();
      if (url && isHttpsUrl(url)) out.push({ label: label || undefined, url });
    } else if (isHttpsUrl(line)) {
      out.push({ url: line });
    }
  }
  return out;
}

function parseSignalIds(formData: FormData): string[] {
  const fromGetAll = formData.getAll("content_signal_ids").map((v) => String(v).trim());
  if (fromGetAll.length) return [...new Set(fromGetAll.filter(Boolean))];
  return splitLines(String(formData.get("content_signal_ids") ?? ""));
}

async function getVoiceForSession(
  db: Awaited<ReturnType<typeof connectMongo>>,
  id: string,
  organizationId: string,
): Promise<Voice | null> {
  const voice = await getVoice(db, id);
  if (!voice || voice.organization_id !== organizationId) return null;
  return voice;
}

async function validateSignalIds(
  db: Awaited<ReturnType<typeof connectMongo>>,
  organizationId: string,
  signalIds: string[],
  session: Awaited<ReturnType<typeof requireOrgMember>>,
): Promise<string[]> {
  const valid: string[] = [];
  for (const id of signalIds) {
    const cs = await getContentSignal(db, id);
    if (cs && canAccessContentSignal(cs, session)) valid.push(id);
  }
  return valid;
}

function parseVoiceFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const website_url = String(formData.get("website_url") ?? "").trim();
  const rss_feed_url = String(formData.get("rss_feed_url") ?? "").trim();
  const keywords = splitLines(String(formData.get("keywords") ?? "")).slice(0, 5);
  const social_links = parseSocialLinks(String(formData.get("social_links") ?? ""));
  const persona = String(formData.get("persona") ?? "");
  const content_signal_ids = parseSignalIds(formData);
  return { name, website_url, rss_feed_url, keywords, social_links, persona, content_signal_ids };
}

async function workerVoiceGenerate(voiceId: string) {
  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) throw new Error("WORKER_URL is not configured");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.INGEST_SECRET) {
    headers["x-ingest-secret"] = process.env.INGEST_SECRET;
  }

  const url = new URL(`${base}/voices/generate`);
  url.searchParams.set("voice_id", voiceId);

  const r = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ voice_id: voiceId }),
  });
  const text = await r.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!r.ok) {
    const err =
      typeof parsed === "object" && parsed && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : text;
    throw new Error(err);
  }
  return parsed;
}

export async function saveVoiceAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const voiceId = String(formData.get("voice_id") ?? "").trim();
  const fields = parseVoiceFields(formData);

  if (!fields.name) redirect("/voices?error=name");

  const db = await connectMongo();
  await ensureIndexes(db);

  const signalIds = await validateSignalIds(db, orgId, fields.content_signal_ids, session);

  const existing = voiceId ? await getVoiceForSession(db, voiceId, orgId) : null;

  const voice = await upsertVoice(db, {
    id: voiceId || undefined,
    organization_id: orgId,
    created_by: session.user.email ?? "unknown",
    name: fields.name,
    website_url: fields.website_url,
    rss_feed_url: fields.rss_feed_url,
    social_links: fields.social_links,
    keywords: fields.keywords,
    content_signal_ids: signalIds,
    persona: fields.persona,
    persona_status: existing?.persona_status ?? "pending",
    persona_error: existing?.persona_error,
    persona_generated_at: existing?.persona_generated_at,
  });

  await linkVoiceToSignals(db, voice.id, orgId, signalIds);

  revalidatePath("/voices");
  redirect(`/voices?voice_id=${voice.id}&saved=1`);
}

export async function generateVoicePersonaAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const voiceId = String(formData.get("voice_id") ?? "").trim();
  if (!voiceId) redirect("/voices?error=missing_voice");

  const db = await connectMongo();
  await ensureIndexes(db);
  const existing = await getVoiceForSession(db, voiceId, orgId);
  if (!existing) redirect("/voices?error=not_found");

  const fields = parseVoiceFields(formData);
  if (!fields.name) redirect(`/voices?voice_id=${voiceId}&error=name`);

  const signalIds = await validateSignalIds(db, orgId, fields.content_signal_ids, session);

  await upsertVoice(db, {
    ...existing,
    ...fields,
    content_signal_ids: signalIds,
    organization_id: orgId,
    created_by: existing.created_by,
    persona_status: "pending",
    persona_error: undefined,
  });
  await linkVoiceToSignals(db, voiceId, orgId, signalIds);

  try {
    await workerVoiceGenerate(voiceId);
  } catch (e) {
    revalidatePath("/voices");
    const detail = encodeURIComponent(
      (e instanceof Error ? e.message : String(e)).slice(0, 240),
    );
    redirect(`/voices?voice_id=${voiceId}&error=generate_failed&error_detail=${detail}`);
  }

  revalidatePath("/voices");
  redirect(`/voices?voice_id=${voiceId}&generating=1`);
}

export async function deleteVoiceAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const voiceId = String(formData.get("voice_id") ?? "").trim();
  if (!voiceId) redirect("/voices");

  const db = await connectMongo();
  const voice = await getVoiceForSession(db, voiceId, orgId);
  if (voice) {
    await deleteVoice(db, voiceId);
  }

  revalidatePath("/voices");
  redirect("/voices?deleted=1");
}
