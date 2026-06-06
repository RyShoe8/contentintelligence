import {
  ensureIndexes,
  getWriterArticle,
  listVoices,
  listWriterArticlesByOrgAndMode,
} from "@content-resourcer/db";
import { WriterForm, type WriterArticleDetail, type WriterArticleListItem } from "@/components/writer-form";
import { PageHeader } from "@/components/ui/page-header";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";

export const dynamic = "force-dynamic";

function voiceIsReady(voice: {
  persona_status: string;
  persona?: string;
  brand_profile?: unknown;
}): boolean {
  if (voice.persona_status !== "ready") return false;
  if (voice.brand_profile) return true;
  return Boolean(voice.persona?.trim());
}

export default async function RewriterPage({
  searchParams,
}: {
  searchParams: Promise<{
    article_id?: string;
    saved?: string;
    deleted?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const [voices, articles] = await Promise.all([
    listVoices(db, orgId),
    listWriterArticlesByOrgAndMode(db, orgId, "rewrite"),
  ]);

  const workerConfigured = !!process.env.WORKER_URL;
  const selectedId = sp.article_id?.trim() ?? "";
  const selectedRaw = selectedId ? await getWriterArticle(db, selectedId, orgId) : null;

  const articleList: WriterArticleListItem[] = articles.map((a) => ({
    id: a.id,
    voice_id: a.voice_id,
    title: a.title,
    status: a.status,
    updated_at: a.updated_at.toISOString(),
  }));

  const selectedArticle: WriterArticleDetail | null =
    selectedRaw && selectedRaw.mode === "rewrite"
      ? {
          id: selectedRaw.id,
          voice_id: selectedRaw.voice_id,
          title: selectedRaw.title,
          status: selectedRaw.status,
          updated_at: selectedRaw.updated_at.toISOString(),
          source_text: selectedRaw.source_text,
          links: selectedRaw.links,
          generated_html: selectedRaw.generated_html,
          final_html: selectedRaw.final_html,
        }
      : null;

  const voiceOptions = voices.map((v) => ({
    id: v.id,
    name: v.name,
    ready: voiceIsReady(v),
  }));

  const errorMsg =
    sp.error === "content_too_short"
      ? `Saved content must be at least 100 characters.`
      : sp.error === "not_found"
        ? "Article not found."
        : sp.error === "missing_article"
          ? "No article selected."
          : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="ReWriter"
        description="Reconstruct articles from extracted facts in a voice persona, weave in your links, edit, and save. Saved articles guide future rewrites for that voice."
      />

      {sp.saved === "1" ? (
        <p className="ui-alert-success text-sm">Article saved. It will be used as a style example for this voice.</p>
      ) : null}
      {sp.deleted === "1" ? (
        <p className="ui-alert-success text-sm">Article deleted.</p>
      ) : null}
      {errorMsg ? <p className="ui-alert-error text-sm">{errorMsg}</p> : null}

      <WriterForm
        key={selectedArticle?.id ?? "new"}
        voices={voiceOptions}
        articles={articleList}
        selectedArticle={selectedArticle}
        workerConfigured={workerConfigured}
      />
    </div>
  );
}
