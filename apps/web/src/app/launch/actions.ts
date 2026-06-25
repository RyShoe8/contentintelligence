"use server";

import { redirect } from "next/navigation";
import {
  ensureIndexes,
  upsertVoice,
  upsertContentSignal,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";

// ── Step 1: Create Voice ───────────────────────────────────────
export async function createVoiceAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const email = session.user.email ?? "";
  const db = await connectMongo();
  await ensureIndexes(db);

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const websiteUrl = (formData.get("website_url") as string | null)?.trim() ?? "";
  const rssFeedUrl = (formData.get("rss_feed_url") as string | null)?.trim() ?? "";
  const keywordsRaw = (formData.get("keywords") as string | null)?.trim() ?? "";

  if (!name) {
    redirect("/launch?error=voice_name&step=1");
  }

  const keywords = keywordsRaw
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 5);

  const voice = await upsertVoice(db, {
    organization_id: orgId,
    name,
    website_url: websiteUrl || "",
    rss_feed_url: rssFeedUrl || "",
    keywords,
    social_links: [],
    preferred_phrases: [],
    content_signal_ids: [],
    distribution_platforms: [],
    brand_mention_level: 50,
    sources_in_posts_level: 0,
    persona: "",
    persona_status: "pending",
    excluded_style_source_urls: [],
    created_by: email,
  });

  redirect(`/launch?step=2&voice_id=${voice.id}`);
}

// ── Step 2: Create Topic ───────────────────────────────────────
export async function createTopicAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() ?? "";
  const keywordsRaw = (formData.get("keywords") as string | null)?.trim() ?? "";
  const voiceId = (formData.get("voice_id") as string | null)?.trim() ?? "";

  if (!name) {
    const voiceParam = voiceId ? `&voice_id=${voiceId}` : "";
    redirect(`/launch?error=topic_name&step=2${voiceParam}`);
  }

  const keywords = keywordsRaw
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  const topic = await upsertContentSignal(db, {
    organization_id: orgId,
    name,
    description,
    keywords,
    lookback_window_hours: 168,
    deal_unit_tokens: [],
    active: true,
    post_min_deal_pct: 50,
    ingest_interval_minutes: null,
  });

  const params = new URLSearchParams({ step: "3", topic_id: topic.id });
  if (voiceId) params.set("voice_id", voiceId);
  redirect(`/launch?${params.toString()}`);
}

// ── Generate Voice Persona (called from wizard step 1) ────────
export async function generateVoicePersonaForLaunchAction(formData: FormData) {
  const voiceId = (formData.get("voice_id") as string | null)?.trim() ?? "";
  if (!voiceId) redirect("/launch?step=1&error=no_voice");

  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) redirect(`/launch?step=1&voice_id=${voiceId}&error=no_worker`);

  try {
    await fetch(`${workerUrl}/voices/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId }),
    });
  } catch {
    redirect(`/launch?step=1&voice_id=${voiceId}&error=worker_failed`);
  }

  redirect(`/launch?step=1&voice_id=${voiceId}&generating=1`);
}
