"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import {
  parseWriterLinks,
  WRITER_LINK_MAX,
  WRITER_SOURCE_MIN_CHARS,
  type WriterLink,
} from "@content-resourcer/db/writer-validation";
import { saveWriterArticleAction, deleteWriterArticleAction } from "@/app/writer/actions";
import { Button } from "@/components/ui/button";
import { WriterHtmlPreview } from "@/components/writer-html-preview";
import { cn } from "@/lib/cn";

export type WriterArticleListItem = {
  id: string;
  voice_id: string;
  title: string;
  status: "draft" | "saved";
  updated_at: string;
};

export type WriterVoiceOption = {
  id: string;
  name: string;
  ready: boolean;
};

export type WriterArticleDetail = WriterArticleListItem & {
  source_text: string;
  links: WriterLink[];
  generated_html: string;
  final_html?: string;
};

type LinkRow = { url: string; label: string };

type Props = {
  voices: WriterVoiceOption[];
  articles: WriterArticleListItem[];
  selectedArticle: WriterArticleDetail | null;
  workerConfigured: boolean;
};

const articlePaneClass =
  "min-h-[320px] flex-1 rounded border border-[var(--border)] bg-[var(--input-bg)]";

function emptyLinkRow(): LinkRow {
  return { url: "", label: "" };
}

function linksToRows(links: WriterLink[]): LinkRow[] {
  if (!links.length) return [emptyLinkRow()];
  return links.map((l) => ({ url: l.url, label: l.label ?? "" }));
}

function rowsToLinks(rows: LinkRow[]): WriterLink[] {
  return parseWriterLinks(
    rows
      .filter((r) => r.url.trim())
      .map((r) => ({ url: r.url.trim(), label: r.label.trim() || undefined })),
  );
}

function confirmDeleteArticle(title: string, e: FormEvent<HTMLFormElement>) {
  const label = title.trim() || "this article";
  if (!confirm(`Delete "${label}"? This cannot be undone.`)) {
    e.preventDefault();
  }
}

function displayHtml(article: WriterArticleDetail | null, draftHtml: string): string {
  if (draftHtml) return draftHtml;
  if (!article) return "";
  return article.final_html?.trim() || article.generated_html || "";
}

function initialExpandedVoiceIds(
  voices: WriterVoiceOption[],
  articles: WriterArticleListItem[],
  selectedArticle: WriterArticleDetail | null,
): Set<string> {
  const ids = new Set<string>();
  const focus =
    selectedArticle?.voice_id ?? voices.find((v) => v.ready)?.id ?? voices[0]?.id ?? "";
  if (focus) ids.add(focus);
  for (const a of articles) ids.add(a.voice_id);
  return ids;
}

export function WriterForm({
  voices,
  articles,
  selectedArticle,
  workerConfigured,
}: Props) {
  const router = useRouter();
  const readyVoices = voices.filter((v) => v.ready);

  const [voiceId, setVoiceId] = useState(
    selectedArticle?.voice_id ?? readyVoices[0]?.id ?? "",
  );
  const [expandedVoiceIds, setExpandedVoiceIds] = useState<Set<string>>(() =>
    initialExpandedVoiceIds(voices, articles, selectedArticle),
  );
  const [articleId, setArticleId] = useState(selectedArticle?.id ?? "");
  const [title, setTitle] = useState(selectedArticle?.title ?? "");
  const [sourceText, setSourceText] = useState(selectedArticle?.source_text ?? "");
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() =>
    linksToRows(selectedArticle?.links ?? []),
  );
  const [outputHtml, setOutputHtml] = useState(() =>
    displayHtml(selectedArticle, selectedArticle?.generated_html ?? ""),
  );
  const [showHtmlPreview, setShowHtmlPreview] = useState(true);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [truncatedNotice, setTruncatedNotice] = useState(false);
  const [linksAppendedNotice, setLinksAppendedNotice] = useState<number | null>(null);
  const [linksRevisedNotice, setLinksRevisedNotice] = useState(false);
  const [rewriteDivergenceMin, setRewriteDivergenceMin] = useState(0);
  const [rewriteDivergenceScore, setRewriteDivergenceScore] = useState<number | null>(null);
  const [rewriteDivergenceBelowMin, setRewriteDivergenceBelowMin] = useState(false);

  const articlesByVoice = useMemo(() => {
    const map = new Map<string, WriterArticleListItem[]>();
    for (const v of voices) map.set(v.id, []);
    for (const a of articles) {
      const list = map.get(a.voice_id) ?? [];
      list.push(a);
      map.set(a.voice_id, list);
    }
    return map;
  }, [articles, voices]);

  const sortedVoices = useMemo(
    () => [...voices].sort((a, b) => a.name.localeCompare(b.name)),
    [voices],
  );

  const selectedVoice = voices.find((v) => v.id === voiceId);
  const canWrite = Boolean(workerConfigured && voiceId && selectedVoice?.ready);
  const showRewriteColumn = Boolean(outputHtml.trim() || articleId);

  const resetComposer = useCallback(() => {
    setArticleId("");
    setTitle("");
    setSourceText("");
    setLinkRows([emptyLinkRow()]);
    setOutputHtml("");
    setWriteError(null);
    setTruncatedNotice(false);
    setLinksAppendedNotice(null);
    setLinksRevisedNotice(false);
    setRewriteDivergenceScore(null);
    setRewriteDivergenceBelowMin(false);
    router.push("/writer");
  }, [router]);

  const loadArticle = useCallback(
    (id: string) => {
      router.push(`/writer?article_id=${encodeURIComponent(id)}`);
    },
    [router],
  );

  const toggleVoiceExpanded = useCallback((id: string) => {
    setExpandedVoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectVoice = useCallback((id: string) => {
    setVoiceId(id);
    setExpandedVoiceIds((prev) => new Set(prev).add(id));
  }, []);

  function updateLinkRow(index: number, patch: Partial<LinkRow>) {
    setLinkRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addLinkRow() {
    setLinkRows((prev) => {
      if (prev.length >= WRITER_LINK_MAX) return prev;
      return [...prev, emptyLinkRow()];
    });
  }

  function removeLinkRow(index: number) {
    setLinkRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyLinkRow()];
    });
  }

  async function handleWrite() {
    if (!canWrite) return;
    const trimmed = sourceText.trim();
    if (trimmed.length < WRITER_SOURCE_MIN_CHARS) {
      setWriteError(`Paste at least ${WRITER_SOURCE_MIN_CHARS} characters of source article.`);
      return;
    }
    const filledLinkRows = linkRows.filter((r) => r.url.trim());
    const links = rowsToLinks(linkRows);
    if (filledLinkRows.length > links.length) {
      const skipped = filledLinkRows.length - links.length;
      setWriteError(
        `${skipped} link${skipped === 1 ? " was" : "s were"} skipped — use valid https:// URLs.`,
      );
      return;
    }

    setWriting(true);
    setWriteError(null);
    setTruncatedNotice(false);
    setLinksAppendedNotice(null);
    setLinksRevisedNotice(false);
    setRewriteDivergenceScore(null);
    setRewriteDivergenceBelowMin(false);
    try {
      const r = await fetch("/api/worker/writer/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: voiceId,
          source_text: trimmed,
          links,
          writer_article_id: articleId || undefined,
          rewrite_divergence_min: rewriteDivergenceMin,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        writer_article_id?: string;
        generated_html?: string;
        source_truncated?: boolean;
        links_appended?: number;
        links_revised?: boolean;
        rewrite_divergence_score?: number;
        rewrite_divergence_min?: number;
        rewrite_divergence_below_min?: boolean;
      };
      if (!r.ok) {
        setWriteError(data.error ?? "Rewrite failed");
        return;
      }
      if (data.generated_html) setOutputHtml(data.generated_html);
      if (data.source_truncated) setTruncatedNotice(true);
      if (typeof data.links_appended === "number" && data.links_appended > 0) {
        setLinksAppendedNotice(data.links_appended);
      }
      if (data.links_revised === true) {
        setLinksRevisedNotice(true);
      }
      if (typeof data.rewrite_divergence_score === "number") {
        setRewriteDivergenceScore(data.rewrite_divergence_score);
      }
      if (data.rewrite_divergence_below_min === true) {
        setRewriteDivergenceBelowMin(true);
      }
      if (data.writer_article_id) {
        setArticleId(data.writer_article_id);
        router.push(`/writer?article_id=${encodeURIComponent(data.writer_article_id)}`);
        router.refresh();
      }
    } catch {
      setWriteError("Rewrite failed");
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-[var(--fg)]">Voices</h2>
          <button
            type="button"
            onClick={resetComposer}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            New article
          </button>
        </div>
        <div className="space-y-2 text-sm">
          {sortedVoices.map((voice) => {
            const list = articlesByVoice.get(voice.id) ?? [];
            const expanded = expandedVoiceIds.has(voice.id);
            const isSelectedVoice = voice.id === voiceId;
            return (
              <div
                key={voice.id}
                className={cn(
                  "rounded-md border border-[var(--border)]",
                  isSelectedVoice && "ring-1 ring-[var(--primary)]",
                )}
              >
                <div className="flex items-stretch bg-[var(--surface-light)]">
                  <button
                    type="button"
                    onClick={() => selectVoice(voice.id)}
                    className={cn(
                      "min-w-0 flex-1 px-3 py-2 text-left font-medium",
                      isSelectedVoice ? "text-[var(--primary)]" : "text-[var(--fg)]",
                    )}
                  >
                    {voice.name}
                    {!voice.ready ? (
                      <span className="ml-1 text-xs font-normal text-amber-200/90">
                        (persona pending)
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                      {list.length} article{list.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleVoiceExpanded(voice.id)}
                    aria-expanded={expanded}
                    aria-label={expanded ? "Collapse articles" : "Expand articles"}
                    className="shrink-0 border-l border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)]"
                  >
                    {expanded ? "▼" : "▶"}
                  </button>
                </div>
                {expanded ? (
                  list.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-[var(--muted)]">No articles yet</p>
                  ) : (
                    <ul className="divide-y divide-[var(--border)]">
                      {list.map((a) => (
                        <li key={a.id} className="flex items-stretch">
                          <button
                            type="button"
                            onClick={() => loadArticle(a.id)}
                            className={cn(
                              "min-w-0 flex-1 px-3 py-2 text-left text-xs hover:bg-[var(--surface-light)]",
                              a.id === articleId &&
                                "bg-[var(--surface-light)] text-[var(--primary)]",
                            )}
                          >
                            <span className="block font-medium text-[var(--fg)]">{a.title}</span>
                            <span className="text-[var(--muted)]">
                              {a.status === "saved" ? "Saved" : "Draft"} ·{" "}
                              {new Date(a.updated_at).toLocaleDateString()}
                            </span>
                          </button>
                          <form
                            action={deleteWriterArticleAction}
                            onSubmit={(e) => confirmDeleteArticle(a.title, e)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex shrink-0 items-center border-l border-[var(--border)] px-2"
                          >
                            <input type="hidden" name="writer_article_id" value={a.id} />
                            <Button type="submit" variant="danger" size="sm">
                              Delete
                            </Button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {!workerConfigured ? (
        <p className="ui-alert-error text-sm">
          Set <code className="text-[var(--fg)]">WORKER_URL</code> on Vercel to enable Writer.
        </p>
      ) : null}
      {readyVoices.length === 0 ? (
        <p className="text-sm text-amber-200/90">
          No voices with a ready persona.{" "}
          <Link href="/voices" className="text-[var(--primary)] hover:underline">
            Generate a persona on Voices
          </Link>{" "}
          first.
        </p>
      ) : null}
      {voiceId && !selectedVoice?.ready ? (
        <p className="text-sm text-amber-200/90">
          Select a voice with a ready persona to write.{" "}
          <Link href="/voices" className="text-[var(--primary)] hover:underline">
            Voices
          </Link>
        </p>
      ) : null}

      <section className="ui-card space-y-4 p-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--muted)]">
              Links to include (up to {WRITER_LINK_MAX})
            </span>
            <button
              type="button"
              onClick={addLinkRow}
              disabled={linkRows.length >= WRITER_LINK_MAX}
              className="text-xs text-[var(--primary)] hover:underline disabled:opacity-50"
            >
              Add link
            </button>
          </div>
          {linkRows.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
              <input
                type="url"
                value={row.url}
                onChange={(e) => updateLinkRow(i, { url: e.target.value })}
                placeholder="https://…"
                className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={row.label}
                onChange={(e) => updateLinkRow(i, { label: e.target.value })}
                placeholder="Anchor text (optional)"
                className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeLinkRow(i)}
                className="text-xs text-red-400 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] flex-1 space-y-1">
            <label
              htmlFor="rewrite-divergence-min"
              className="text-sm text-[var(--muted)]"
            >
              Min difference from original: {rewriteDivergenceMin}%
            </label>
            <input
              id="rewrite-divergence-min"
              type="range"
              min={0}
              max={100}
              step={5}
              value={rewriteDivergenceMin}
              onChange={(e) => setRewriteDivergenceMin(Number(e.target.value))}
              disabled={writing}
              className="w-full accent-[var(--primary)]"
            />
            <p className="text-xs text-[var(--muted)]">
              0 = light edit, 100 = heavy rewrite (same facts).
            </p>
          </div>
          <Button type="button" disabled={writing || !canWrite} onClick={() => void handleWrite()}>
            {writing ? "Writing…" : "Write"}
          </Button>
        </div>
        {writeError ? <p className="text-sm text-red-300/90">{writeError}</p> : null}
        {rewriteDivergenceScore != null ? (
          <p className="text-xs text-[var(--muted)]">
            Difference from original: {rewriteDivergenceScore}%
          </p>
        ) : null}
        {rewriteDivergenceBelowMin ? (
          <p className="text-xs text-amber-200/90">
            Rewrite was {rewriteDivergenceScore ?? "—"}% different; your minimum was{" "}
            {rewriteDivergenceMin}%. Try Write again with a higher setting.
          </p>
        ) : null}
        {truncatedNotice ? (
          <p className="text-xs text-amber-200/90">
            Source was truncated for length; review the rewrite.
          </p>
        ) : null}
        {linksRevisedNotice ? (
          <p className="text-xs text-amber-200/90">
            Links were reworked for more natural placement in the article.
          </p>
        ) : null}
        {linksAppendedNotice != null && linksAppendedNotice > 0 ? (
          <p className="text-xs text-amber-200/90">
            {linksAppendedNotice} link{linksAppendedNotice === 1 ? " was" : "s were"} added
            automatically at the end because the draft omitted them.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-[360px] flex-col gap-2">
          <h2 className="text-sm font-medium text-[var(--fg)]">Original article</h2>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            rows={16}
            placeholder="Paste the full source article…"
            className={cn(articlePaneClass, "resize-y px-3 py-2 font-mono text-sm text-[var(--fg)]")}
          />
        </div>

        <div className="flex min-h-[360px] flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-[var(--fg)]">Rewritten article</h2>
            {showRewriteColumn ? (
              <div className="flex rounded-md border border-[var(--border)] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setShowHtmlPreview(true)}
                  className={cn(
                    "rounded px-2 py-1",
                    showHtmlPreview
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--muted)] hover:text-[var(--fg)]",
                  )}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setShowHtmlPreview(false)}
                  className={cn(
                    "rounded px-2 py-1",
                    !showHtmlPreview
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--muted)] hover:text-[var(--fg)]",
                  )}
                >
                  HTML source
                </button>
              </div>
            ) : null}
          </div>

          {showRewriteColumn ? (
            <form
              id="writer-save-form"
              action={saveWriterArticleAction}
              className="flex min-h-0 flex-1 flex-col gap-4"
            >
              <input type="hidden" name="writer_article_id" value={articleId} />
              {showHtmlPreview ? (
                <input type="hidden" name="final_html" value={outputHtml} />
              ) : null}

              <div className={cn(articlePaneClass, "flex min-h-0 flex-col overflow-hidden")}>
                {showHtmlPreview ? (
                  <div className="flex-1 overflow-y-auto p-4">
                    {outputHtml.trim() ? (
                      <WriterHtmlPreview html={outputHtml} />
                    ) : (
                      <p className="text-sm text-[var(--muted)]">No HTML to preview.</p>
                    )}
                  </div>
                ) : (
                  <textarea
                    name="final_html"
                    value={outputHtml}
                    onChange={(e) => setOutputHtml(e.target.value)}
                    rows={16}
                    className="min-h-[280px] flex-1 resize-y border-0 bg-transparent px-3 py-2 font-mono text-xs text-[var(--fg)] focus:outline-none"
                  />
                )}
              </div>

              <p className="text-xs text-[var(--muted)]">
                {showHtmlPreview
                  ? "Switch to HTML source to edit markup. Save uses the current HTML."
                  : "Edit HTML, then save. Paste into your blog WYSIWYG (HTML mode)."}
              </p>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Title</span>
                <input
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2"
                />
              </label>

            </form>
          ) : (
            <div
              className={cn(
                articlePaneClass,
                "flex flex-1 items-center justify-center p-4 text-sm text-[var(--muted)]",
              )}
            >
              Run Write to generate a rewrite for the selected voice.
            </div>
          )}

          {articleId ? (
            <div className="flex flex-wrap gap-2">
              {showRewriteColumn ? (
                <Button
                  type="submit"
                  form="writer-save-form"
                  variant="primary"
                  disabled={!articleId}
                >
                  Save article
                </Button>
              ) : null}
              <form
                action={deleteWriterArticleAction}
                onSubmit={(e) => confirmDeleteArticle(title, e)}
              >
                <input type="hidden" name="writer_article_id" value={articleId} />
                <Button type="submit" variant="danger" size="sm">
                  Delete article
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
