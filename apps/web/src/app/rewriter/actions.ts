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

async function extractWriterFingerprints(voiceId: string, organizationId: string, html: string) {
  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.INGEST_SECRET) {
    headers["x-ingest-secret"] = process.env.INGEST_SECRET;
  }

  await fetch(`${base}/writer/fingerprints`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      voice_id: voiceId,
      organization_id: organizationId,
      html,
    }),
  });
}

export async function saveRewriterArticleAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const id = String(formData.get("writer_article_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const finalHtml = String(formData.get("final_html") ?? "").trim();

  if (!id) redirect("/rewriter?error=missing_article");
  if (finalHtml.length < WRITER_SOURCE_MIN_CHARS) {
    redirect(`/rewriter?article_id=${id}&error=content_too_short`);
  }

  const db = await connectMongo();
  await ensureIndexes(db);
  const existing = await getWriterArticle(db, id, orgId);
  if (!existing || existing.mode !== "rewrite") redirect("/rewriter?error=not_found");

  await updateWriterArticle(db, id, orgId, {
    title: title || existing.title,
    final_html: finalHtml,
    status: "saved",
  });

  void extractWriterFingerprints(existing.voice_id, orgId, finalHtml).catch(() => {});

  revalidatePath("/rewriter");
  redirect(`/rewriter?article_id=${id}&saved=1`);
}

export async function deleteRewriterArticleAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const id = String(formData.get("writer_article_id") ?? "").trim();
  if (!id) redirect("/rewriter?error=missing_article");

  const db = await connectMongo();
  await ensureIndexes(db);
  await deleteWriterArticle(db, id, orgId);

  revalidatePath("/rewriter");
  redirect("/rewriter?deleted=1");
}
