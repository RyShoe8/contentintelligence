"use server";

import {
  contentSignalToTemplatePayload,
  deleteContentSignalTemplate,
  ensureIndexes,
  getContentSignalTemplate,
  purgeExpiredSignalItems,
  upsertContentSignal,
  upsertContentSignalTemplate,
} from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import { getSignalForSession } from "./actions";
import { TEMPLATE_SCHEDULE_OPTIONS } from "./template-constants";

const SCHEDULE_OPTIONS = TEMPLATE_SCHEDULE_OPTIONS;

function splitLines(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseScheduleValue(raw: string): number | null {
  if (raw === "" || raw === "off") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return SCHEDULE_OPTIONS.includes(n as (typeof SCHEDULE_OPTIONS)[number]) ? n : null;
}

async function getTemplateForSession(
  db: Awaited<ReturnType<typeof connectMongo>>,
  id: string,
  organizationId: string,
) {
  const template = await getContentSignalTemplate(db, id);
  if (!template || template.organization_id !== organizationId) return null;
  return template;
}

function parseTemplateFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const keywords = splitLines(String(formData.get("keywords") ?? ""));
  const lookback = Number(formData.get("lookback_window_hours") ?? 168);
  const deal_unit_tokens = splitLines(String(formData.get("deal_unit_tokens") ?? ""));
  const active = formData.get("active") === "on";
  const minRaw = Number(formData.get("post_min_deal_pct"));
  const post_min_deal_pct =
    Number.isFinite(minRaw) && minRaw >= 0 && minRaw <= 100 ? Math.round(minRaw) : 50;
  const ingest_interval_minutes = parseScheduleValue(
    String(formData.get("ingest_interval_minutes") ?? ""),
  );

  return {
    name,
    description,
    keywords,
    lookback_window_hours: Number.isFinite(lookback) && lookback > 0 ? lookback : 168,
    deal_unit_tokens,
    active,
    post_min_deal_pct,
    ingest_interval_minutes,
  };
}

export async function saveTemplateFromSignalAction(formData: FormData) {
  const session = await requireOrgMember();
  const db = await connectMongo();
  await ensureIndexes(db);

  const contentSignalId = String(formData.get("content_signal_id") ?? "").trim();
  const templateName = String(formData.get("template_name") ?? "").trim();
  if (!contentSignalId || !templateName) {
    redirect("/content-signals?error=template_name");
  }

  const cs = await getSignalForSession(db, contentSignalId, session);
  if (!cs) redirect("/content-signals?error=not_found");

  const payload = contentSignalToTemplatePayload(cs, templateName, session.user.email!);
  await upsertContentSignalTemplate(db, {
    ...payload,
    organization_id: session.user.organizationId,
    created_by: session.user.email!,
  });

  revalidatePath("/content-signals");
  revalidatePath(`/content-signals/${contentSignalId}`);
  const returnTo = String(formData.get("return_to") ?? "").trim();
  const safeReturn =
    returnTo.startsWith("/content-signals") && !returnTo.includes("//")
      ? returnTo
      : "/content-signals";
  const sep = safeReturn.includes("?") ? "&" : "?";
  redirect(`${safeReturn}${sep}template_saved=1`);
}

export async function saveTemplateAction(formData: FormData) {
  const session = await requireOrgMember();
  const db = await connectMongo();
  await ensureIndexes(db);

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const fields = parseTemplateFields(formData);
  if (!fields.name) redirect("/content-signals?error=template_name");

  if (id) {
    const existing = await getTemplateForSession(db, id, session.user.organizationId);
    if (!existing) redirect("/content-signals?error=template_not_found");
  }

  await upsertContentSignalTemplate(db, {
    id,
    organization_id: session.user.organizationId,
    created_by: session.user.email!,
    ...fields,
  });

  revalidatePath("/content-signals");
  redirect("/content-signals?template_saved=1");
}

export async function createSignalFromTemplateAction(formData: FormData) {
  const session = await requireOrgMember();
  const db = await connectMongo();
  await ensureIndexes(db);

  const templateId = String(formData.get("template_id") ?? "").trim();
  const signalName = String(formData.get("signal_name") ?? "").trim();
  if (!templateId || !signalName) {
    redirect("/content-signals?error=signal_name");
  }

  const template = await getTemplateForSession(db, templateId, session.user.organizationId);
  if (!template) redirect("/content-signals?error=template_not_found");

  const saved = await upsertContentSignal(db, {
    organization_id: session.user.organizationId,
    name: signalName,
    description: template.description,
    keywords: template.keywords,
    lookback_window_hours: template.lookback_window_hours,
    deal_unit_tokens: template.deal_unit_tokens,
    active: template.active,
    post_min_deal_pct: template.post_min_deal_pct,
    ingest_interval_minutes: template.ingest_interval_minutes,
  });
  await purgeExpiredSignalItems(db, saved.id, saved.lookback_window_hours);

  revalidatePath("/content-signals");
  revalidatePath("/feed");
  revalidatePath("/posts");
  redirect(`/content-signals/${saved.id}?signal_created=1`);
}

export async function deleteTemplateAction(formData: FormData) {
  const session = await requireOrgMember();
  const db = await connectMongo();
  const id = String(formData.get("id") ?? "").trim();
  if (id) {
    const template = await getTemplateForSession(db, id, session.user.organizationId);
    if (!template) redirect("/content-signals?error=template_not_found");
    await deleteContentSignalTemplate(db, id);
  }
  revalidatePath("/content-signals");
  redirect("/content-signals?template_deleted=1");
}
