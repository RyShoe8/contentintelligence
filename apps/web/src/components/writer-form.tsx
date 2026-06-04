"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  parseWriterLinks,
  WRITER_LINK_MAX,
  WRITER_SOURCE_MIN_CHARS,
  type WriterLink,
} from "@content-resourcer/db";
import { saveWriterArticleAction, deleteWriterArticleAction } from "@/app/writer/actions";
import { Button } from "@/components/ui/button";

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

function displayHtml(article: WriterArticleDetail | null, draftHtml: string): string {
  if (draftHtml) return draftHtml;
  if (!article) return "";
  return article.final_html?.trim() || article.generated_html || "";
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
  const [articleId, setArticleId] = useState(selectedArticle?.id ?? "");
  const [title, setTitle] = useState(selectedArticle?.title ?? "");
  const [sourceText, setSourceText] = useState(selectedArticle?.source_text ?? "");
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() =>
    linksToRows(selectedArticle?.links ?? []),
  );
  const [outputHtml, setOutputHtml] = useState(() =>
    displayHtml(selectedArticle, selectedArticle?.generated_html ?? ""),
  );
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [truncatedNotice, setTruncatedNotice] = useState(false);

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

  const resetComposer = useCallback(() => {
    setArticleId("");
    setTitle("");
    setSourceText("");
    setLinkRows([emptyLinkRow()]);
    setOutputHtml("");
    setWriteError(null);
    setTruncatedNotice(false);
    router.push("/writer");
  }, [router]);

  const loadArticle = useCallback(
    (id: string) => {
      router.push(`/writer?article_id=${encodeURIComponent(id)}`);
    },
    [router],
  );

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
    if (!workerConfigured || !voiceId) return;
    const trimmed = sourceText.trim();
    if (trimmed.length < WRITER_SOURCE_MIN_CHARS) {
      setWriteError(`Paste at least ${WRITER_SOURCE_MIN_CHARS} characters of source article.`);
      return;
    }
    let links: WriterLink[];
    try {
      links = rowsToLinks(linkRows);
    } catch {
      setWriteError("Each link must be a valid https:// URL.");
      return;
    }

    setWriting(true);
    setWriteError(null);
    setTruncatedNotice(false);
    try {
      const r = await fetch("/api/worker/writer/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: voiceId,
          source_text: trimmed,
          links,
          writer_article_id: articleId || undefined,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        writer_article_id?: string;
        generated_html?: string;
        source_truncated?: boolean;
      };
      if (!r.ok) {
        setWriteError(data.error ?? "Rewrite failed");
        return;
      }
      if (data.generated_html) setOutputHtml(data.generated_html);
      if (data.source_truncated) setTruncatedNotice(true);
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
    <div className="grid gap-8 lg:grid-cols-[minmax(220px,280px)_1fr]">
      <aside className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-[var(--fg)]">By voice</h2>
          <button
            type="button"
            onClick={resetComposer}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            New article
          </button>
        </div>
        <div className="space-y-3 text-sm">
          {sortedVoices.map((voice) => {
            const list = articlesByVoice.get(voice.id) ?? [];
            return (
              <div key={voice.id} className="rounded-md border border-[var(--border)]">
                <div className="border-b border-[var(--border)] bg-[var(--surface-light)] px-3 py-2 font-medium">
                  {voice.name}
                  {!voice.ready ? (
                    <span className="ml-1 text-xs font-normal text-amber-200/90">(persona pending)</span>
                  ) : null}
                </div>
                {list.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--muted)]">No articles yet</p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {list.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => loadArticle(a.id)}
                          className={`w-full px-3 py-2 text-left text-xs hover:bg-[var(--surface-light)] ${
                            a.id === articleId ? "bg-[var(--surface-light)] text-[var(--primary)]" : ""
                          }`}
                        >
                          <span className="block font-medium text-[var(--fg)]">{a.title}</span>
                          <span className="text-[var(--muted)]">
                            {a.status === "saved" ? "Saved" : "Draft"} ·{" "}
                            {new Date(a.updated_at).toLocaleDateString()}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <div className="space-y-6">
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

        <section className="ui-card space-y-4 p-6">
          <h2 className="text-lg font-medium">Source</h2>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Voice</span>
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              disabled={!readyVoices.length}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
            >
              {readyVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Article to rewrite</span>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={12}
              placeholder="Paste the full source article…"
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 font-mono text-sm text-[var(--fg)]"
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--muted)]">Links to include (up to {WRITER_LINK_MAX})</span>
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

          <Button
            type="button"
            disabled={writing || !workerConfigured || !voiceId}
            onClick={() => void handleWrite()}
          >
            {writing ? "Writing…" : "Write"}
          </Button>
          {writeError ? <p className="text-sm text-red-300/90">{writeError}</p> : null}
          {truncatedNotice ? (
            <p className="text-xs text-amber-200/90">Source was truncated for length; review the rewrite.</p>
          ) : null}
        </section>

        {(outputHtml || articleId) && (
          <section className="ui-card space-y-4 p-6">
            <h2 className="text-lg font-medium">Rewritten article (HTML)</h2>
            <p className="text-xs text-[var(--muted)]">
              Edit below, then save. Paste into your blog WYSIWYG editor (HTML mode or paste from source).
            </p>

            <form action={saveWriterArticleAction} className="space-y-4">
              <input type="hidden" name="writer_article_id" value={articleId} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Title</span>
                <input
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">HTML body</span>
                <textarea
                  name="final_html"
                  value={outputHtml}
                  onChange={(e) => setOutputHtml(e.target.value)}
                  rows={16}
                  className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 font-mono text-xs text-[var(--fg)]"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" disabled={!articleId}>
                  Save article
                </Button>
              </div>
            </form>

            {articleId ? (
              <form action={deleteWriterArticleAction}>
                <input type="hidden" name="writer_article_id" value={articleId} />
                <Button type="submit" variant="danger" size="sm">
                  Delete
                </Button>
              </form>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}
