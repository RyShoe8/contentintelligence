"use server";

import {
  deleteWriterArticle,
  ensureIndexes,
  getWriterArticle,
  updateWriterArticle,
  WRITER_SOURCE_MIN_CHARS,
} from "@content-resourcer/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";

export async function saveWriterArticleAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const id = String(formData.get("writer_article_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const finalHtml = String(formData.get("final_html") ?? "").trim();

  if (!id) redirect("/writer?error=missing_article");
  if (finalHtml.length < WRITER_SOURCE_MIN_CHARS) {
    redirect(`/writer?article_id=${id}&error=content_too_short`);
  }

  const db = await connectMongo();
  await ensureIndexes(db);
  const existing = await getWriterArticle(db, id, orgId);
  if (!existing) redirect("/writer?error=not_found");

  await updateWriterArticle(db, id, orgId, {
    title: title || existing.title,
    final_html: finalHtml,
    status: "saved",
  });

  revalidatePath("/writer");
  redirect(`/writer?article_id=${id}&saved=1`);
}

export async function deleteWriterArticleAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const id = String(formData.get("writer_article_id") ?? "").trim();
  if (!id) redirect("/writer?error=missing_article");

  const db = await connectMongo();
  await ensureIndexes(db);
  await deleteWriterArticle(db, id, orgId);

  revalidatePath("/writer");
  redirect("/writer?deleted=1");
}
