"use server";

import {
  ensureIndexes,
  upsertContentSignal,
  deleteContentSignal,
  getContentSignal,
  upsertSource,
  deleteSource,
  getSource,
} from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";

function splitLines(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function saveContentSignalAction(formData: FormData) {
  const db = await connectMongo();
  await ensureIndexes(db);
  const id = String(formData.get("id") ?? "").trim() || undefined;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/content-signals?error=name");

  const description = String(formData.get("description") ?? "");
  const active = formData.get("active") === "on";
  const keywords = splitLines(String(formData.get("keywords") ?? ""));
  const lookback = Number(formData.get("lookback_window_hours") ?? 168);
  const deal_unit_tokens = splitLines(String(formData.get("deal_unit_tokens") ?? ""));

  const saved = await upsertContentSignal(db, {
    id,
    name,
    description,
    keywords,
    lookback_window_hours: Number.isFinite(lookback) && lookback > 0 ? lookback : 168,
    deal_unit_tokens,
    active,
  });
  revalidatePath("/content-signals");
  revalidatePath(`/content-signals/${saved.id}`);
  revalidatePath("/feed");
  redirect(id ? `/content-signals/${saved.id}` : "/content-signals");
}

export async function deleteContentSignalAction(formData: FormData) {
  const db = await connectMongo();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteContentSignal(db, id);
  revalidatePath("/content-signals");
  revalidatePath("/feed");
  redirect("/content-signals");
}

export async function toggleContentSignalAction(formData: FormData) {
  const db = await connectMongo();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/content-signals");
  const cs = await getContentSignal(db, id);
  if (!cs) redirect("/content-signals");
  await upsertContentSignal(db, {
    id: cs.id,
    name: cs.name,
    description: cs.description,
    keywords: cs.keywords,
    lookback_window_hours: cs.lookback_window_hours,
    deal_unit_tokens: cs.deal_unit_tokens,
    active: !cs.active,
  });
  revalidatePath("/content-signals");
  revalidatePath(`/content-signals/${id}`);
  redirect(`/content-signals/${id}`);
}

export async function createSourceAction(formData: FormData) {
  const db = await connectMongo();
  await ensureIndexes(db);
  const content_signal_id = String(formData.get("content_signal_id") ?? "").trim();
  if (!content_signal_id) redirect("/content-signals");

  const source = await upsertSource(db, {
    content_signal_id,
    enabled: true,
    config: {
      email_address: "",
      scan_body: true,
      ai_summary_enabled: true,
    },
  });
  revalidatePath(`/content-signals/${content_signal_id}`);
  redirect(`/content-signals/${content_signal_id}/sources/${source.id}`);
}

export async function saveSourceAction(formData: FormData) {
  const db = await connectMongo();
  await ensureIndexes(db);

  const id = String(formData.get("id") ?? "").trim();
  const content_signal_id = String(formData.get("content_signal_id") ?? "").trim();
  if (!id || !content_signal_id) redirect("/content-signals");

  const existing = await getSource(db, id);
  const labels = splitLines(String(formData.get("labels") ?? ""));
  const sender_addresses = splitLines(String(formData.get("sender_addresses") ?? ""));
  const sender_domains = splitLines(String(formData.get("sender_domains") ?? ""));
  const scan_body = formData.get("scan_body") === "on";
  const ai_summary_enabled = formData.get("ai_summary_enabled") === "on";
  const enabled = formData.get("enabled") === "on";

  await upsertSource(db, {
    id,
    content_signal_id,
    enabled,
    config: {
      email_address: existing?.config.email_address ?? "",
      labels: labels.length ? labels : undefined,
      sender_addresses: sender_addresses.length ? sender_addresses : undefined,
      sender_domains: sender_domains.length ? sender_domains : undefined,
      scan_body,
      ai_summary_enabled,
    },
  });
  revalidatePath(`/content-signals/${content_signal_id}`);
  revalidatePath(`/content-signals/${content_signal_id}/sources/${id}`);
  revalidatePath("/feed");
  redirect(`/content-signals/${content_signal_id}/sources/${id}?saved=1`);
}

export async function deleteSourceAction(formData: FormData) {
  const db = await connectMongo();
  const id = String(formData.get("id") ?? "");
  const content_signal_id = String(formData.get("content_signal_id") ?? "");
  if (id) await deleteSource(db, id);
  revalidatePath(`/content-signals/${content_signal_id}`);
  revalidatePath("/feed");
  redirect(`/content-signals/${content_signal_id}`);
}

export async function toggleSourceAction(formData: FormData) {
  const db = await connectMongo();
  const id = String(formData.get("id") ?? "");
  const content_signal_id = String(formData.get("content_signal_id") ?? "");
  if (!id) redirect(`/content-signals/${content_signal_id}`);
  const s = await getSource(db, id);
  if (!s) redirect(`/content-signals/${content_signal_id}`);
  await upsertSource(db, {
    id: s.id,
    content_signal_id: s.content_signal_id,
    enabled: !s.enabled,
    config: s.config,
  });
  revalidatePath(`/content-signals/${content_signal_id}`);
  redirect(`/content-signals/${content_signal_id}`);
}
