"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  parseWriterLinks,
  parseWriterReferenceUrls,
  WRITER_LINK_MAX,
  WRITER_REFERENCE_URL_MAX,
  WRITER_TOPIC_MIN_CHARS,
  WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT,
  WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT,
  WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT,
  WRITER_WEB_SEARCH_MAX_RESULTS_LIMIT,
  type WriterLink,
} from "@content-resourcer/db/writer-validation";
import { saveWriterArticleAction, deleteWriterArticleAction } from "@/app/writer/actions";
import { Button } from "@/components/ui/button";
import { WriterHtmlPreview } from "@/components/writer-html-preview";
import { cn } from "@/lib/cn";

export type WriterComposeArticleListItem = {
  id: string;
  voice_id: string;
  title: string;
  status: "draft" | "saved";
  updated_at: string;
};

export type WriterComposeVoiceOption = {
  id: string;
  name: string;
  ready: boolean;
};

export type WriterComposeArticleDetail = WriterComposeArticleListItem & {
  topic: string;
  reference_urls: string[];
  source_text: string;
  links: WriterLink[];
  generated_html: string;
  final_html?: string;
};

type LinkRow = { url: string; label: string };

type Props = {
  voices: WriterComposeVoiceOption[];
  articles: WriterComposeArticleListItem[];
  selectedArticle: WriterComposeArticleDetail | null;
  workerConfigured: boolean;
  webSearchAvailable?: boolean;
};

const articlePaneClass =
  "min-h-[320px] flex-1 rounded border border-[var(--border)] bg-[var(--input-bg)]";

function emptyLinkRow(): LinkRow {
  return { url: "", label: "" };
}

function emptyReferenceUrlRow(): string {
  return "";
}

function linksToRows(links: WriterLink[]): LinkRow[] {
  if (!links.length) return [emptyLinkRow()];
  return links.map((l) => ({ url: l.url, label: l.label ?? "" }));
}

function referenceUrlsToRows(urls: string[]): string[] {
  if (!urls.length) return [emptyReferenceUrlRow()];
  return [...urls];
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

function displayHtml(article: WriterComposeArticleDetail | null, draftHtml: string): string {
  if (draftHtml) return draftHtml;
  if (!article) return "";
  return article.final_html?.trim() || article.generated_html || "";
}

function initialExpandedVoiceIds(
  voices: WriterComposeVoiceOption[],
  articles: WriterComposeArticleListItem[],
  selectedArticle: WriterComposeArticleDetail | null,
): Set<string> {
  const ids = new Set<string>();
  const focus =
    selectedArticle?.voice_id ?? voices.find((v) => v.ready)?.id ?? voices[0]?.id ?? "";
  if (focus) ids.add(focus);
  for (const a of articles) ids.add(a.voice_id);
  return ids;
}

export function WriterComposeForm({
  voices,
  articles,
  selectedArticle,
  workerConfigured,
  webSearchAvailable = false,
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
  const [topic, setTopic] = useState(selectedArticle?.topic ?? "");
  const [referenceUrlRows, setReferenceUrlRows] = useState<string[]>(() =>
    referenceUrlsToRows(selectedArticle?.reference_urls ?? []),
  );
  const [researchBrief, setResearchBrief] = useState(selectedArticle?.source_text ?? "");
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() =>
    linksToRows(selectedArticle?.links ?? []),
  );
  const [outputHtml, setOutputHtml] = useState(() =>
    displayHtml(selectedArticle, selectedArticle?.generated_html ?? ""),
  );
  const [showHtmlPreview, setShowHtmlPreview] = useState(true);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [referencesFetched, setReferencesFetched] = useState<number | null>(null);
  const [referencesFailed, setReferencesFailed] = useState<string[]>([]);
  const [linksPresent, setLinksPresent] = useState<number | null>(null);
  const [linksRequested, setLinksRequested] = useState<number | null>(null);
  const [linksAdded, setLinksAdded] = useState<number | null>(null);
  const [linksWovenNotice, setLinksWovenNotice] = useState<number | null>(null);
  const [linksAppendedNotice, setLinksAppendedNotice] = useState<number | null>(null);
  const [linksRedistributedNotice, setLinksRedistributedNotice] = useState<number | null>(null);
  const [linksRevisedNotice, setLinksRevisedNotice] = useState(false);
  const [humanAuthenticityScore, setHumanAuthenticityScore] = useState<number | null>(null);
  const [brandConsistencyScore, setBrandConsistencyScore] = useState<number | null>(null);
  const [genericityScore, setGenericityScore] = useState<number | null>(null);
  const [humanizationAttempts, setHumanizationAttempts] = useState<number | null>(null);
  const [deepResearch, setDeepResearch] = useState(true);
  const [webSearch, setWebSearch] = useState(true);
  const [webSearchMaxQueries, setWebSearchMaxQueries] = useState(
    WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT,
  );
  const [webSearchMaxResults, setWebSearchMaxResults] = useState(
    WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT,
  );
  const [researchQuestions, setResearchQuestions] = useState<number | null>(null);
  const [userReferencesFetched, setUserReferencesFetched] = useState<number | null>(null);
  const [webReferencesFetched, setWebReferencesFetched] = useState<number | null>(null);
  const [researchMode, setResearchMode] = useState<string | null>(null);

  const articlesByVoice = useMemo(() => {
    const map = new Map<string, WriterComposeArticleListItem[]>();
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

  const sortedReadyVoices = useMemo(
    () => [...readyVoices].sort((a, b) => a.name.localeCompare(b.name)),
    [readyVoices],
  );

  const selectedVoice = voices.find((v) => v.id === voiceId);
  const canWrite = Boolean(workerConfigured && voiceId && selectedVoice?.ready);
  const showOutputColumn = Boolean(outputHtml.trim() || articleId);

  const resetComposer = useCallback(() => {
    setArticleId("");
    setTitle("");
    setTopic("");
    setReferenceUrlRows([emptyReferenceUrlRow()]);
    setResearchBrief("");
    setLinkRows([emptyLinkRow()]);
    setOutputHtml("");
    setWriteError(null);
    setReferencesFetched(null);
    setReferencesFailed([]);
    setLinksPresent(null);
    setLinksRequested(null);
    setLinksAdded(null);
    setLinksWovenNotice(null);
    setLinksAppendedNotice(null);
    setLinksRedistributedNotice(null);
    setLinksRevisedNotice(false);
    setHumanAuthenticityScore(null);
    setBrandConsistencyScore(null);
    setGenericityScore(null);
    setHumanizationAttempts(null);
    setResearchQuestions(null);
    setUserReferencesFetched(null);
    setWebReferencesFetched(null);
    setResearchMode(null);
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

  useEffect(() => {
    if (readyVoices.length === 0) return;
    if (!readyVoices.some((v) => v.id === voiceId)) {
      selectVoice(readyVoices[0]!.id);
    }
  }, [readyVoices, voiceId, selectVoice]);

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

  function updateReferenceUrlRow(index: number, value: string) {
    setReferenceUrlRows((prev) => prev.map((row, i) => (i === index ? value : row)));
  }

  function addReferenceUrlRow() {
    setReferenceUrlRows((prev) => {
      if (prev.length >= WRITER_REFERENCE_URL_MAX) return prev;
      return [...prev, emptyReferenceUrlRow()];
    });
  }

  function removeReferenceUrlRow(index: number) {
    setReferenceUrlRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyReferenceUrlRow()];
    });
  }

  async function handleWrite() {
    if (!canWrite) return;
    const trimmedTopic = topic.trim();
    if (trimmedTopic.length < WRITER_TOPIC_MIN_CHARS) {
      setWriteError(`Enter a topic of at least ${WRITER_TOPIC_MIN_CHARS} characters.`);
      return;
    }

    const filledReferenceRows = referenceUrlRows.filter((r) => r.trim());
    const referenceUrls = parseWriterReferenceUrls(filledReferenceRows);
    if (filledReferenceRows.length > referenceUrls.length) {
      const skipped = filledReferenceRows.length - referenceUrls.length;
      setWriteError(
        `${skipped} reference URL${skipped === 1 ? "" : "s"} skipped — use valid https:// URLs.`,
      );
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
    setReferencesFetched(null);
    setReferencesFailed([]);
    setLinksPresent(null);
    setLinksRequested(null);
    setLinksAdded(null);
    setLinksWovenNotice(null);
    setLinksAppendedNotice(null);
    setLinksRedistributedNotice(null);
    setLinksRevisedNotice(false);
    setHumanAuthenticityScore(null);
    setBrandConsistencyScore(null);
    setGenericityScore(null);
    setHumanizationAttempts(null);
    setResearchQuestions(null);
    setUserReferencesFetched(null);
    setWebReferencesFetched(null);
    setResearchMode(null);

    try {
      const r = await fetch("/api/worker/writer/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: voiceId,
          topic: trimmedTopic,
          reference_urls: referenceUrls,
          links,
          writer_article_id: articleId || undefined,
          deep_research: deepResearch,
          web_search: webSearch,
          ...(webSearch
            ? {
                web_search_max_queries: webSearchMaxQueries,
                web_search_max_results: webSearchMaxResults,
              }
            : {}),
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        writer_article_id?: string;
        generated_html?: string;
        research_brief?: string;
        references_fetched?: number;
        references_failed?: string[];
        user_references_fetched?: number;
        web_references_fetched?: number;
        web_search_urls?: string[];
        research_questions?: number;
        research_mode?: string;
        links_requested?: number;
        links_present?: number;
        links_added?: number;
        links_woven?: number;
        links_appended?: number;
        links_redistributed?: number;
        links_revised?: boolean;
        human_authenticity_score?: number;
        brand_consistency_score?: number;
        genericity_score?: number;
        humanization_attempts?: number;
      };
      if (!r.ok) {
        setWriteError(data.error ?? "Generation failed");
        return;
      }
      if (data.generated_html) setOutputHtml(data.generated_html);
      if (data.research_brief) setResearchBrief(data.research_brief);
      if (typeof data.references_fetched === "number") {
        setReferencesFetched(data.references_fetched);
      }
      if (Array.isArray(data.references_failed)) {
        setReferencesFailed(data.references_failed);
      }
      if (typeof data.research_questions === "number") {
        setResearchQuestions(data.research_questions);
      }
      if (typeof data.user_references_fetched === "number") {
        setUserReferencesFetched(data.user_references_fetched);
      }
      if (typeof data.web_references_fetched === "number") {
        setWebReferencesFetched(data.web_references_fetched);
      }
      if (typeof data.research_mode === "string") {
        setResearchMode(data.research_mode);
      }
      if (typeof data.links_requested === "number") setLinksRequested(data.links_requested);
      if (typeof data.links_present === "number") setLinksPresent(data.links_present);
      if (typeof data.links_added === "number") setLinksAdded(data.links_added);
      if (typeof data.links_woven === "number" && data.links_woven > 0) {
        setLinksWovenNotice(data.links_woven);
      }
      if (typeof data.links_appended === "number" && data.links_appended > 0) {
        setLinksAppendedNotice(data.links_appended);
      }
      if (typeof data.links_redistributed === "number" && data.links_redistributed > 0) {
        setLinksRedistributedNotice(data.links_redistributed);
      }
      if (data.links_revised === true) setLinksRevisedNotice(true);
      if (typeof data.human_authenticity_score === "number") {
        setHumanAuthenticityScore(data.human_authenticity_score);
      }
      if (typeof data.brand_consistency_score === "number") {
        setBrandConsistencyScore(data.brand_consistency_score);
      }
      if (typeof data.genericity_score === "number") {
        setGenericityScore(data.genericity_score);
      }
      if (typeof data.humanization_attempts === "number") {
        setHumanizationAttempts(data.humanization_attempts);
      }
      if (data.writer_article_id) {
        setArticleId(data.writer_article_id);
        router.push(`/writer?article_id=${encodeURIComponent(data.writer_article_id)}`);
        router.refresh();
      }
    } catch {
      setWriteError("Generation failed");
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-[var(--fg)]">Articles by voice</h2>
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Voice</span>
          <select
            value={
              sortedReadyVoices.some((v) => v.id === voiceId)
                ? voiceId
                : (sortedReadyVoices[0]?.id ?? "")
            }
            onChange={(e) => selectVoice(e.target.value)}
            disabled={writing || sortedReadyVoices.length === 0}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          >
            {sortedReadyVoices.length === 0 ? (
              <option value="">No ready voices</option>
            ) : (
              sortedReadyVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))
            )}
          </select>
          <span className="text-xs text-[var(--muted)]">
            Persona and style used when you Write.
            {sortedReadyVoices.length === 0 ? (
              <>
                {" "}
                <Link href="/voices" className="text-[var(--primary)] hover:underline">
                  Generate a persona on Voices
                </Link>
                .
              </>
            ) : null}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Topic</span>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder="What should this article cover?"
            className="resize-y rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--muted)]">
              Reference sources (up to {WRITER_REFERENCE_URL_MAX}, research only)
            </span>
            <button
              type="button"
              onClick={addReferenceUrlRow}
              disabled={referenceUrlRows.length >= WRITER_REFERENCE_URL_MAX}
              className="text-xs text-[var(--primary)] hover:underline disabled:opacity-50"
            >
              Add URL
            </button>
          </div>
          {referenceUrlRows.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="url"
                value={row}
                onChange={(e) => updateReferenceUrlRow(i, e.target.value)}
                placeholder="https://…"
                className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeReferenceUrlRow(i)}
                className="text-xs text-red-400 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

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

        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-start gap-2 text-[var(--fg)]">
            <input
              type="checkbox"
              checked={deepResearch}
              onChange={(e) => setDeepResearch(e.target.checked)}
              disabled={writing}
              className="mt-1 accent-[var(--primary)]"
            />
            <span>
              Deep topic research
              <span className="block text-xs text-[var(--muted)]">
                Plans sub-questions from your topic and builds a detailed research brief before
                writing. Slower but more thorough.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-[var(--fg)]">
            <input
              type="checkbox"
              checked={webSearch}
              onChange={(e) => setWebSearch(e.target.checked)}
              disabled={writing || !webSearchAvailable}
              className="mt-1 accent-[var(--primary)]"
            />
            <span>
              Search the web for this topic
              <span className="block text-xs text-[var(--muted)]">
                {webSearchAvailable
                  ? "Discovers additional sources via Tavily (requires TAVILY_API_KEY on worker)."
                  : "Requires TAVILY_API_KEY on the worker (optional)."}
              </span>
            </span>
          </label>
          {webSearch && webSearchAvailable ? (
            <div className="ml-6 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Max search queries</span>
                <input
                  type="number"
                  min={1}
                  max={WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT}
                  value={webSearchMaxQueries}
                  onChange={(e) =>
                    setWebSearchMaxQueries(
                      Math.min(
                        WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT,
                        Math.max(1, Number(e.target.value) || WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT),
                      ),
                    )
                  }
                  disabled={writing}
                  className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Max web sources to fetch</span>
                <input
                  type="number"
                  min={1}
                  max={WRITER_WEB_SEARCH_MAX_RESULTS_LIMIT}
                  value={webSearchMaxResults}
                  onChange={(e) =>
                    setWebSearchMaxResults(
                      Math.min(
                        WRITER_WEB_SEARCH_MAX_RESULTS_LIMIT,
                        Math.max(1, Number(e.target.value) || WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT),
                      ),
                    )
                  }
                  disabled={writing}
                  className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <Button type="button" disabled={writing || !canWrite} onClick={() => void handleWrite()}>
            {writing ? "Researching…" : "Write"}
          </Button>
        </div>
        {writeError ? <p className="text-sm text-red-300/90">{writeError}</p> : null}
        {researchMode != null || researchQuestions != null ? (
          <p className="text-xs text-[var(--muted)]">
            Research mode: {researchMode ?? "—"}
            {researchQuestions != null && researchQuestions > 0
              ? ` · ${researchQuestions} sub-questions`
              : ""}
          </p>
        ) : null}
        {referencesFetched != null || referencesFailed.length > 0 ? (
          <p className="text-xs text-[var(--muted)]">
            Sources fetched: {referencesFetched ?? 0}
            {userReferencesFetched != null || webReferencesFetched != null
              ? ` (${userReferencesFetched ?? 0} reference, ${webReferencesFetched ?? 0} web)`
              : ""}
            {referencesFailed.length > 0
              ? ` · ${referencesFailed.length} failed to load`
              : ""}
          </p>
        ) : null}
        {linksRequested != null && linksRequested > 0 ? (
          <p
            className={cn(
              "text-xs",
              linksPresent != null && linksPresent < linksRequested
                ? "text-amber-200/90"
                : "text-[var(--muted)]",
            )}
          >
            Requested links included: {linksPresent ?? "—"}/{linksRequested}
            {linksWovenNotice != null && linksWovenNotice > 0
              ? ` (${linksWovenNotice} woven into body automatically)`
              : ""}
          </p>
        ) : null}
        {humanAuthenticityScore != null && genericityScore != null ? (
          <p className="text-xs text-[var(--muted)]">
            Human authenticity: {humanAuthenticityScore}
            {brandConsistencyScore != null ? ` · Brand consistency: ${brandConsistencyScore}` : ""}
            {` · Genericity: ${genericityScore}`}
            {humanizationAttempts != null && humanizationAttempts > 1
              ? ` (${humanizationAttempts} humanization passes)`
              : ""}
          </p>
        ) : null}
        {linksRevisedNotice ? (
          <p className="text-xs text-amber-200/90">
            Links were reworked for more natural placement in the article.
          </p>
        ) : null}
        {linksRedistributedNotice != null && linksRedistributedNotice > 0 ? (
          <p className="text-xs text-[var(--muted)]">
            {linksRedistributedNotice} link{linksRedistributedNotice === 1 ? "" : "s"} moved earlier
            in the article for more natural placement.
          </p>
        ) : null}
        {linksAppendedNotice != null && linksAppendedNotice > 0 ? (
          <p className="text-xs text-amber-200/90">
            {linksAppendedNotice} link{linksAppendedNotice === 1 ? "" : "s"} added in a Related links
            section at the end.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-[360px] flex-col gap-2">
          <h2 className="text-sm font-medium text-[var(--fg)]">Research brief</h2>
          <textarea
            value={researchBrief}
            onChange={(e) => setResearchBrief(e.target.value)}
            rows={16}
            readOnly={!researchBrief.trim()}
            placeholder="Generated research brief appears here after Write."
            className={cn(
              articlePaneClass,
              "resize-y px-3 py-2 font-mono text-sm text-[var(--fg)]",
              researchBrief.trim() && "opacity-90",
            )}
          />
        </div>

        <div className="flex min-h-[360px] flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-[var(--fg)]">Article</h2>
            {showOutputColumn ? (
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

          {showOutputColumn ? (
            <form
              id="writer-compose-save-form"
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
              Run Write to generate an article for the selected voice.
            </div>
          )}

          {articleId ? (
            <div className="flex flex-wrap gap-2">
              {showOutputColumn ? (
                <Button
                  type="submit"
                  form="writer-compose-save-form"
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
