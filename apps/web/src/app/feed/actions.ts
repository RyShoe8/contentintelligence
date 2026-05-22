"use server";

import {
  clearFeedForContentSignal,
  ensureIndexes,
  getContentSignal,
} from "@content-resourcer/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";

export async function clearFeedAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?next=/feed");
  }

  const content_signal_id = String(formData.get("content_signal_id") ?? "").trim();
  if (!content_signal_id) {
    redirect("/feed?error=missing_signal");
  }

  const db = await connectMongo();
  await ensureIndexes(db);
  const cs = await getContentSignal(db, content_signal_id);
  if (!cs) {
    redirect("/feed?error=not_found");
  }

  const deleted = await clearFeedForContentSignal(db, content_signal_id);
  revalidatePath("/feed");
  revalidatePath(`/feed/${content_signal_id}`);
  redirect(`/feed?content_signal_id=${content_signal_id}&cleared=${deleted}`);
}
