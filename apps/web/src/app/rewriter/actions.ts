"use server";

import {
  createWriterArticleSaved,
  deleteWriterArticle,
  ensureIndexes,
  getWriterArticle,
  updateWriterArticle,
  WRITER_SOURCE_MIN_CHARS,
} from "@content-resourcer/db";
import { parseWriterLinks } from "@content-resourcer/db/writer-validation";
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

function parseLinksField(raw: string): ReturnType<typeof parseWriterLinks> {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parseWriterLinks(
      parsed.map((item) => {
        const row = item as { url?: string; label?: string };
        return { url: String(row.url ?? ""), label: row.label };
      }),
    );
  } catch {
    return [];
  }
}

export async function saveRewriterArticleAction(formData: FormData) {
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const email = session.user.email;
  if (!email) redirect("/rewriter?error=not_found");

  const id = String(formData.get("writer_article_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const finalHtml = String(formData.get("final_html") ?? "").trim();
  const generatedHtml = String(formData.get("generated_html") ?? "").trim() || finalHtml;

  if (finalHtml.length < WRITER_SOURCE_MIN_CHARS) {
    redirect(id ? `/rewriter?article_id=${id}&error=content_too_short` : "/rewriter?error=content_too_short");
  }

  const db = await connectMongo();
  await ensureIndexes(db);

  if (id) {
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

  const voiceId = String(formData.get("voice_id") ?? "").trim();
  const sourceText = String(formData.get("source_text") ?? "").trim();
  const links = parseLinksField(String(formData.get("links") ?? ""));

  if (!voiceId || sourceText.length < WRITER_SOURCE_MIN_CHARS) {
    redirect("/rewriter?error=missing_article");
  }

  const created = await createWriterArticleSaved(db, {
    organization_id: orgId,
    voice_id: voiceId,
    mode: "rewrite",
    source_text: sourceText,
    links,
    generated_html: generatedHtml,
    final_html: finalHtml,
    title: title || undefined,
    created_by: email,
  });

  void extractWriterFingerprints(created.voice_id, orgId, finalHtml).catch(() => {});

  revalidatePath("/rewriter");
  redirect(`/rewriter?article_id=${created.id}&saved=1`);
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
