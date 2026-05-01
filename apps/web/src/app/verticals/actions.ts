"use server";

import {
  ensureIndexes,
  upsertVertical,
  deleteVertical,
  getVertical,
} from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";

export async function saveVerticalAction(formData: FormData) {
  const db = await connectMongo();
  await ensureIndexes(db);
  const id = String(formData.get("id") ?? "").trim() || undefined;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/verticals?error=name");

  const description = String(formData.get("description") ?? "");
  const active = formData.get("active") === "on";
  const kwRaw = String(formData.get("keywords") ?? "");
  const default_keywords = kwRaw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  await upsertVertical(db, {
    id,
    name,
    description,
    default_keywords,
    active,
  });
  revalidatePath("/verticals");
  redirect("/verticals");
}

export async function deleteVerticalAction(formData: FormData) {
  const db = await connectMongo();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteVertical(db, id);
  revalidatePath("/verticals");
  revalidatePath("/signals");
  revalidatePath("/feed");
  redirect("/verticals");
}

export async function toggleVerticalAction(formData: FormData) {
  const db = await connectMongo();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/verticals");
  const v = await getVertical(db, id);
  if (!v) redirect("/verticals");
  await upsertVertical(db, {
    id: v.id,
    name: v.name,
    description: v.description,
    default_keywords: v.default_keywords,
    active: !v.active,
  });
  revalidatePath("/verticals");
  redirect("/verticals");
}
