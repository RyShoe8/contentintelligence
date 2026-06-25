import {
  ensureIndexes,
  getWriterArticle,
  listVoices,
  listSavedWriterArticlesByOrg,
} from "@content-resourcer/db";
import {
  stripHtmlToPlainText,
  writerArticleDisplayHtml,
  WRITER_SOURCE_MIN_CHARS,
} from "@content-resourcer/db/writer-validation";
import {
  WriterForm,
  type WriterArticleDetail,
  type WriterArticleListItem,
  type WriterImportSource,
} from "@/components/writer-form";
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

function articleMode(mode: string | undefined): "compose" | "rewrite" {
  return mode === "compose" ? "compose" : "rewrite";
}

export default async function RewriterPage({
  searchParams,
}: {
  searchParams: Promise<{
    article_id?: string;
    import_from?: string;
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
    listSavedWriterArticlesByOrg(db, orgId),
  ]);

  const workerConfigured = !!process.env.WORKER_URL;
  const selectedId = sp.article_id?.trim() ?? "";
  const importId = sp.import_from?.trim() ?? "";
  const selectedRaw = selectedId ? await getWriterArticle(db, selectedId, orgId) : null;
  const importRaw =
    importId && !selectedId ? await getWriterArticle(db, importId, orgId) : null;

  const articleList: WriterArticleListItem[] = articles
    .filter((a) => !a.mode || a.mode === "compose" || a.mode === "rewrite")
    .map((a) => ({
      id: a.id,
      voice_id: a.voice_id,
      title: a.title,
      status: a.status,
      updated_at: a.updated_at.toISOString(),
      mode: articleMode(a.mode),
    }));

  const selectedArticle: WriterArticleDetail | null =
    selectedRaw && articleMode(selectedRaw.mode) === "rewrite"
      ? {
          id: selectedRaw.id,
          voice_id: selectedRaw.voice_id,
          title: selectedRaw.title,
          status: selectedRaw.status,
          updated_at: selectedRaw.updated_at.toISOString(),
          mode: articleMode(selectedRaw.mode),
          source_text: selectedRaw.source_text,
          links: selectedRaw.links,
          generated_html: selectedRaw.generated_html,
          final_html: selectedRaw.final_html,
        }
      : null;

  let importSource: WriterImportSource | null = null;
  if (importRaw && !selectedArticle) {
    const sourceHtml = writerArticleDisplayHtml(importRaw);
    const sourceText = stripHtmlToPlainText(sourceHtml);
    if (sourceText.length >= WRITER_SOURCE_MIN_CHARS) {
      importSource = {
        article_id: importRaw.id,
        voice_id: importRaw.voice_id,
        title: importRaw.title,
        source_text: sourceText,
        source_html: sourceHtml,
      };
    }
  }

  const voiceOptions = voices.map((v) => ({
    id: v.id,
    name: v.name,
    ready: voiceIsReady(v),
  }));

  const errorMsg =
    sp.error === "content_too_short"
      ? `Saved content must be at least 100 characters.`
      : sp.error === "import_too_short"
        ? `That article has no output long enough to rewrite (minimum ${WRITER_SOURCE_MIN_CHARS} characters).`
        : sp.error === "not_found"
          ? "Article not found."
          : sp.error === "missing_article"
            ? "No article selected."
            : importId && !importRaw && !selectedArticle
              ? "Article not found."
              : importId && importRaw && !importSource && !selectedArticle
                ? `That article has no output long enough to rewrite (minimum ${WRITER_SOURCE_MIN_CHARS} characters).`
                : null;

  const formKey = selectedArticle?.id ?? importSource?.article_id ?? "new";

  return (
    <div className="space-y-8">
      <PageHeader
        title="ReWriter"
        description="Reconstruct articles from extracted facts in a voice persona, weave in your links, edit, and save. Write generates output in this session; Save adds the article to your library as a style example for that voice."
      />

      {sp.saved === "1" ? (
        <p className="ui-alert-success text-sm">Article saved. It will be used as a style example for this voice.</p>
      ) : null}
      {sp.deleted === "1" ? (
        <p className="ui-alert-success text-sm">Article deleted.</p>
      ) : null}
      {errorMsg ? <p className="ui-alert-error text-sm">{errorMsg}</p> : null}

      <WriterForm
        key={formKey}
        voices={voiceOptions}
        articles={articleList}
        selectedArticle={selectedArticle}
        importSource={importSource}
        workerConfigured={workerConfigured}
      />
    </div>
  );
}
