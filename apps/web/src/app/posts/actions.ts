"use server";

import {
  archivePost,
  ensureIndexes,
  getContentSignal,
  updateContentSignalPostSettings,
} from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";
import { canAccessContentSignal, requireOrgMember } from "@/lib/org-auth";

const SCHEDULE_OPTIONS = [null, 15, 30, 60, 120, 360, 1440] as const;

function parseScheduleValue(raw: string): number | null {
  if (raw === "" || raw === "off") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return SCHEDULE_OPTIONS.includes(n as (typeof SCHEDULE_OPTIONS)[number]) ? n : null;
}

async function workerFetch(path: string, contentSignalId?: string, signalItemId?: string) {
  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) throw new Error("WORKER_URL is not configured");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.INGEST_SECRET) {
    headers["x-ingest-secret"] = process.env.INGEST_SECRET;
  }

  const url = new URL(`${base}${path}`);
  if (contentSignalId) url.searchParams.set("content_signal_id", contentSignalId);
  if (signalItemId) url.searchParams.set("signal_item_id", signalItemId);

  const r = await fetch(url.toString(), { method: "POST", headers });
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

export async function savePostSettingsAction(formData: FormData) {
  const session = await requireOrgMember();
  const contentSignalId = String(formData.get("content_signal_id") ?? "").trim();
  if (!contentSignalId) redirect("/posts?error=missing_signal");

  const db = await connectMongo();
  await ensureIndexes(db);
  const cs = await getContentSignal(db, contentSignalId);
  if (!cs || !canAccessContentSignal(cs, session)) {
    redirect("/posts?error=not_found");
  }

  const minRaw = Number(formData.get("post_min_deal_pct"));
  const post_min_deal_pct =
    Number.isFinite(minRaw) && minRaw >= 0 && minRaw <= 100 ? Math.round(minRaw) : 50;
  const ingest_interval_minutes = parseScheduleValue(String(formData.get("ingest_interval_minutes") ?? ""));

  await updateContentSignalPostSettings(db, contentSignalId, {
    post_min_deal_pct,
    ingest_interval_minutes,
  });

  try {
    await workerFetch("/posts/sync", contentSignalId);
  } catch {
    revalidatePath("/posts");
    redirect(`/posts?content_signal_id=${contentSignalId}&saved=1&sync_failed=1`);
  }

  revalidatePath("/posts");
  redirect(`/posts?content_signal_id=${contentSignalId}&saved=1`);
}

export async function refreshPostsAction(formData: FormData) {
  const session = await requireOrgMember();
  const contentSignalId = String(formData.get("content_signal_id") ?? "").trim();
  if (!contentSignalId) redirect("/posts?error=missing_signal");

  const db = await connectMongo();
  const cs = await getContentSignal(db, contentSignalId);
  if (!cs || !canAccessContentSignal(cs, session)) {
    redirect("/posts?error=not_found");
  }

  try {
    await workerFetch("/posts/sync", contentSignalId);
    revalidatePath("/posts");
    redirect(`/posts?content_signal_id=${contentSignalId}&refreshed=1`);
  } catch {
    redirect(`/posts?content_signal_id=${contentSignalId}&error=sync_failed`);
  }
}

export async function archivePostAction(formData: FormData) {
  const session = await requireOrgMember();
  const postId = String(formData.get("post_id") ?? "").trim();
  const contentSignalId = String(formData.get("content_signal_id") ?? "").trim();
  if (!postId || !contentSignalId) redirect("/posts");

  const db = await connectMongo();
  await archivePost(db, postId, session.user.organizationId);
  revalidatePath("/posts");
  redirect(`/posts?content_signal_id=${contentSignalId}&archived=1`);
}

export { SCHEDULE_OPTIONS };
