import {
  ensureIndexes,
  getWriterArticle,
  listVoices,
  listSavedWriterArticlesByOrg,
  resolveWriterComposeStatus,
} from "@content-resourcer/db";
import { WRITER_ARTICLE_DEPTH_DEFAULT } from "@content-resourcer/db/writer-validation";
import {
  stripHtmlToPlainText,
  writerArticleDisplayHtml,
  WRITER_SOURCE_MIN_CHARS,
} from "@content-resourcer/db/writer-validation";
import {
  WriterComposeForm,
  type WriterComposeArticleDetail,
  type WriterComposeArticleListItem,
} from "@/components/writer-compose-form";
import {
  WriterForm,
  type WriterArticleDetail,
  type WriterArticleListItem,
  type WriterImportSource,
} from "@/components/writer-form";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Article Studio",
  description:
    "Compose researched articles from scratch or rewrite existing content in your brand voice.",
};

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

type Tab = "compose" | "rewrite";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    article_id?: string;
    import_from?: string;
    saved?: string;
    deleted?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeTab: Tab = sp.tab === "rewrite" ? "rewrite" : "compose";

  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const workerConfigured = !!process.env.WORKER_URL;
  const webSearchAvailable = !!process.env.TAVILY_API_KEY;
  const selectedId = sp.article_id?.trim() ?? "";
  const importId = sp.import_from?.trim() ?? "";

  // Fetch data for both tabs in parallel
  const [voices, composeArticles, rewriteArticles, selectedRaw, importRaw] =
    await Promise.all([
      listVoices(db, orgId),
      listSavedWriterArticlesByOrg(db, orgId, "compose"),
      listSavedWriterArticlesByOrg(db, orgId),
      selectedId ? getWriterArticle(db, selectedId, orgId) : null,
      importId && !selectedId ? getWriterArticle(db, importId, orgId) : null,
    ]);

  const voiceOptions = voices.map((v) => ({
    id: v.id,
    name: v.name,
    ready: voiceIsReady(v),
  }));

  // --- Compose tab data ---
  const composeArticleList: WriterComposeArticleListItem[] = composeArticles.map((a) => ({
    id: a.id,
    voice_id: a.voice_id,
    title: a.title,
    status: a.status,
    updated_at: a.updated_at.toISOString(),
  }));

  const selectedComposeArticle: WriterComposeArticleDetail | null =
    selectedRaw && selectedRaw.mode === "compose"
      ? {
          id: selectedRaw.id,
          voice_id: selectedRaw.voice_id,
          title: selectedRaw.title,
          status: selectedRaw.status,
          updated_at: selectedRaw.updated_at.toISOString(),
          topic: selectedRaw.topic ?? "",
          reference_urls: selectedRaw.reference_urls ?? [],
          subtopics: selectedRaw.subtopics ?? [],
          article_depth: selectedRaw.article_depth ?? WRITER_ARTICLE_DEPTH_DEFAULT,
          source_text: selectedRaw.source_text,
          links: selectedRaw.links,
          generated_html: selectedRaw.generated_html,
          final_html: selectedRaw.final_html,
          compose_status: resolveWriterComposeStatus(selectedRaw),
          compose_error: selectedRaw.compose_error,
          compose_phase: selectedRaw.compose_phase,
          compose_requested_at: selectedRaw.compose_requested_at?.toISOString(),
        }
      : null;

  const composeErrorMsg =
    sp.error === "content_too_short"
      ? `Saved content must be at least 100 characters.`
      : sp.error === "not_found"
        ? "Article not found."
        : sp.error === "missing_article"
          ? "No article selected."
          : null;

  // --- Rewrite tab data ---
  const rewriteArticleList: WriterArticleListItem[] = rewriteArticles
    .filter((a) => !a.mode || a.mode === "compose" || a.mode === "rewrite")
    .map((a) => ({
      id: a.id,
      voice_id: a.voice_id,
      title: a.title,
      status: a.status,
      updated_at: a.updated_at.toISOString(),
      mode: articleMode(a.mode),
    }));

  const selectedRewriteArticle: WriterArticleDetail | null =
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
  if (importRaw && !selectedRewriteArticle) {
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

  const rewriteErrorMsg =
    sp.error === "content_too_short"
      ? `Saved content must be at least 100 characters.`
      : sp.error === "import_too_short"
        ? `That article has no output long enough to rewrite (minimum ${WRITER_SOURCE_MIN_CHARS} characters).`
        : sp.error === "not_found"
          ? "Article not found."
          : sp.error === "missing_article"
            ? "No article selected."
            : importId && !importRaw && !selectedRewriteArticle
              ? "Article not found."
              : importId && importRaw && !importSource && !selectedRewriteArticle
                ? `That article has no output long enough to rewrite (minimum ${WRITER_SOURCE_MIN_CHARS} characters).`
                : null;

  const composeFormKey = selectedComposeArticle?.id ?? "new";
  const rewriteFormKey = selectedRewriteArticle?.id ?? importSource?.article_id ?? "new";

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: "compose", label: "Compose", emoji: "✍️" },
    { id: "rewrite", label: "Rewrite", emoji: "🔄" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight gradient-text">Article Studio</h1>
        <p className="text-sm text-[var(--fg-secondary)]">
          Compose researched articles from scratch or rewrite existing content in your brand voice.
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="ui-card flex gap-1 p-1"
        style={{ borderRadius: "var(--radius-lg)", width: "fit-content" }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          // Preserve relevant search params on tab switch
          const href =
            tab.id === "compose"
              ? `/studio?tab=compose${sp.article_id ? `&article_id=${sp.article_id}` : ""}`
              : `/studio?tab=rewrite${sp.article_id ? `&article_id=${sp.article_id}` : ""}${sp.import_from ? `&import_from=${sp.import_from}` : ""}`;
          return (
            <Link
              key={tab.id}
              href={href}
              className={[
                "flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-[var(--primary-dim,rgba(99,102,241,0.15))] border-b-2 border-[var(--primary)] text-[var(--primary)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]",
              ].join(" ")}
              aria-current={isActive ? "page" : undefined}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Alerts */}
      {sp.saved === "1" ? (
        <p className="ui-alert-success text-sm">
          Article saved. It will be used as a style example for this voice.
        </p>
      ) : null}
      {sp.deleted === "1" ? (
        <p className="ui-alert-success text-sm">Article deleted.</p>
      ) : null}
      {activeTab === "compose" && composeErrorMsg ? (
        <p className="ui-alert-error text-sm">{composeErrorMsg}</p>
      ) : null}
      {activeTab === "rewrite" && rewriteErrorMsg ? (
        <p className="ui-alert-error text-sm">{rewriteErrorMsg}</p>
      ) : null}

      {/* Tab content */}
      {activeTab === "compose" ? (
        <WriterComposeForm
          key={composeFormKey}
          voices={voiceOptions}
          articles={composeArticleList}
          selectedArticle={selectedComposeArticle}
          workerConfigured={workerConfigured}
          webSearchAvailable={webSearchAvailable}
        />
      ) : (
        <WriterForm
          key={rewriteFormKey}
          voices={voiceOptions}
          articles={rewriteArticleList}
          selectedArticle={selectedRewriteArticle}
          importSource={importSource}
          workerConfigured={workerConfigured}
        />
      )}
    </div>
  );
}
