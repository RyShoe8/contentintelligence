"use server";

import { ensureIndexes, upsertInputSignal, deleteInputSignal } from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";

function splitLines(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function saveSignalAction(formData: FormData) {
  const db = await connectMongo();
  await ensureIndexes(db);

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const vertical_id = String(formData.get("vertical_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!vertical_id || !name) redirect("/signals?error=missing");

  const keywords = splitLines(String(formData.get("keywords") ?? ""));
  const email_address = String(formData.get("email_address") ?? "").trim();
  const labels = splitLines(String(formData.get("labels") ?? ""));
  const sender_addresses = splitLines(String(formData.get("sender_addresses") ?? ""));
  const sender_domains = splitLines(String(formData.get("sender_domains") ?? ""));
  const subject_keywords = splitLines(String(formData.get("subject_keywords") ?? ""));
  const scan_body = formData.get("scan_body") === "on";
  const lookback = Number(formData.get("lookback_window_hours") ?? 168);
  const enabled = formData.get("enabled") === "on";

  const config = {
    email_address,
    labels: labels.length ? labels : undefined,
    sender_addresses: sender_addresses.length ? sender_addresses : undefined,
    sender_domains: sender_domains.length ? sender_domains : undefined,
    subject_keywords: subject_keywords.length ? subject_keywords : undefined,
    scan_body,
    lookback_window_hours: Number.isFinite(lookback) && lookback > 0 ? lookback : 168,
  };

  await upsertInputSignal(db, {
    id,
    vertical_id,
    name,
    enabled,
    keywords,
    config,
  });
  revalidatePath("/signals");
  revalidatePath("/feed");
  redirect("/signals");
}

export async function deleteSignalAction(formData: FormData) {
  const db = await connectMongo();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteInputSignal(db, id);
  revalidatePath("/signals");
  revalidatePath("/feed");
  redirect("/signals");
}
