"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  parseWriterLinks,
  parseWriterReferenceUrls,
  parseWriterSubtopics,
  writerArticleDepthLabel,
  WRITER_ARTICLE_DEPTH_DEFAULT,
  WRITER_LINK_MAX,
  WRITER_REFERENCE_URL_MAX,
  WRITER_SOURCE_MIN_CHARS,
  WRITER_SUBTOPIC_MAX,
  WRITER_TOPIC_MIN_CHARS,
  WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT,
  WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT,
  WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT,
  WRITER_WEB_SEARCH_MAX_RESULTS_LIMIT,
  writerArticleDisplayHtml,
  resolveComposeArticleType,
  hasEditorialResearchBriefHeaders,
  type ComposeArticleType,
  type WriterLink,
} from "@content-resourcer/db/writer-validation";
import {
  resolveComposeResearchedAtIso,
  resolveComposeWrittenAtIso,
} from "@content-resourcer/db";
import { saveWriterArticleAction, deleteWriterArticleAction, deleteUnsavedWriterDraftAction } from "@/app/writer/actions";
import {
  COMPOSE_STALL_MESSAGE,
  composeGenerationStartedAt,
  composeJoinProgressLabel,
  composeProgressLabel,
  clearComposePollMode,
  clearComposePollSession,
  loadComposePollSession,
  parseServerNowMs,
  resolveComposePollMode,
  saveComposePollMode,
  saveComposePollSession,
  shouldAcceptComposePollReady,
  isPollStatusRetryable,
  shouldPollCompose,
  shouldShowComposeLinkReworkNotices,
  shouldShowComposeResearchStats,
  shouldStallComposePoll,
  type ComposeResultPhase,
} from "@/app/writer/compose-poll";
import { Button } from "@/components/ui/button";
import { LocalDateTime } from "@/components/local-date-time";
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
  subtopics: string[];
  article_depth: number;
  article_type?: ComposeArticleType;
  source_text: string;
  links: WriterLink[];
  generated_html: string;
  final_html?: string;
  compose_status?: "pending" | "ready" | "failed";
  compose_error?: string;
  compose_phase?: "full" | "write_only";
  compose_requested_at?: string;
  compose_researched_at?: string;
  compose_written_at?: string;
};

type ComposeStatusResponse = {
  error?: string;
  writer_article_id?: string;
  compose_status?: "pending" | "ready" | "failed";
  compose_error?: string;
  compose_phase?: "full" | "write_only";
  compose_requested_at?: string;
  compose_researched_at?: string;
  compose_written_at?: string;
  server_now?: string;
  accepted?: boolean;
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
  voice_quality_warning?: string;
};

const COMPOSE_POLL_INTERVAL_MS = 3000;

async function fetchComposeReadyGate(articleId: string): Promise<number | null> {
  try {
    const r = await fetch(
      `/api/writer/articles/${encodeURIComponent(articleId)}/compose-status`,
      { cache: "no-store" },
    );
    const data = (await r.json().catch(() => ({}))) as ComposeStatusResponse;
    if (!r.ok) return null;
    return composeGenerationStartedAt({ compose_requested_at: data.compose_requested_at });
  } catch {
    return null;
  }
}

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

function composeTimestampsFromDetail(article: WriterComposeArticleDetail | null): {
  researched?: string;
  written?: string;
} {
  if (!article) return {};
  const updatedAt = new Date(article.updated_at);
  return {
    researched: resolveComposeResearchedAtIso({
      compose_researched_at: article.compose_researched_at
        ? new Date(article.compose_researched_at)
        : undefined,
      source_text: article.source_text,
      updated_at: updatedAt,
    }),
    written: resolveComposeWrittenAtIso({
      compose_written_at: article.compose_written_at
        ? new Date(article.compose_written_at)
        : undefined,
      generated_html: article.generated_html,
      updated_at: updatedAt,
    }),
  };
}

function initialExpandedVoiceIds(
  _voices: WriterComposeVoiceOption[],
  _articles: WriterComposeArticleListItem[],
  _selectedArticle: WriterComposeArticleDetail | null,
): Set<string> {
  return new Set();
}

function initialPendingComposeState(selectedArticle: WriterComposeArticleDetail | null): {
  writing: boolean;
  composeWriteMode: "full" | "write_only" | null;
  composeProgress: string | null;
} {
  if (
    !selectedArticle?.id ||
    !shouldPollCompose({
      compose_status: selectedArticle.compose_status,
      compose_requested_at: selectedArticle.compose_requested_at,
    })
  ) {
    return { writing: false, composeWriteMode: null, composeProgress: null };
  }
  const mode = resolveComposePollMode(selectedArticle.id, {
    serverPhase: selectedArticle.compose_phase,
  });
  return {
    writing: true,
    composeWriteMode: mode,
    composeProgress: composeProgressLabel(mode),
  };
}

function composeVoiceWarningDisplayMessage(warning: string): string {
  return warning.replace(/\.\s*Review before publishing\.?\s*$/i, "").trim();
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
  const pendingComposeInitial = initialPendingComposeState(selectedArticle);
  const initialTimestamps = composeTimestampsFromDetail(selectedArticle);

  const [voiceId, setVoiceId] = useState(
    selectedArticle?.voice_id ?? readyVoices[0]?.id ?? "",
  );
  const [expandedVoiceIds, setExpandedVoiceIds] = useState<Set<string>>(() =>
    initialExpandedVoiceIds(voices, articles, selectedArticle),
  );
  const [articleId, setArticleId] = useState(selectedArticle?.id ?? "");
  const [articleStatus, setArticleStatus] = useState<"draft" | "saved">(
    selectedArticle?.status ?? "draft",
  );
  const [title, setTitle] = useState(selectedArticle?.title ?? "");
  const [topic, setTopic] = useState(selectedArticle?.topic ?? "");
  const [referenceUrlRows, setReferenceUrlRows] = useState<string[]>(() =>
    referenceUrlsToRows(selectedArticle?.reference_urls ?? []),
  );
  const [researchBrief, setResearchBrief] = useState(selectedArticle?.source_text ?? "");
  const [lastResearchedAt, setLastResearchedAt] = useState<string | undefined>(
    initialTimestamps.researched,
  );
  const [lastWrittenAt, setLastWrittenAt] = useState<string | undefined>(
    initialTimestamps.written,
  );
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() =>
    linksToRows(selectedArticle?.links ?? []),
  );
  const [outputHtml, setOutputHtml] = useState(() => writerArticleDisplayHtml(selectedArticle));
  const [showHtmlPreview, setShowHtmlPreview] = useState(true);
  const [writing, setWriting] = useState(pendingComposeInitial.writing);
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
  const [resultComposePhase, setResultComposePhase] = useState<ComposeResultPhase | null>(
    selectedArticle?.compose_phase ?? null,
  );
  const [voiceQualityWarning, setVoiceQualityWarning] = useState<string | null>(null);
  const [deepResearch, setDeepResearch] = useState(true);
  const [webSearch, setWebSearch] = useState(true);
  const [includeFaq, setIncludeFaq] = useState(false);
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
  const [articleDepth, setArticleDepth] = useState(
    selectedArticle?.article_depth ?? WRITER_ARTICLE_DEPTH_DEFAULT,
  );
  const [subtopicsText, setSubtopicsText] = useState(() =>
    (selectedArticle?.subtopics ?? []).join("\n"),
  );
  const [articleType, setArticleType] = useState<ComposeArticleType>(() =>
    resolveComposeArticleType(
      selectedArticle?.article_type,
      selectedArticle?.topic ?? "",
      selectedArticle?.subtopics ?? [],
    ),
  );
  const articleTypeTouchedRef = useRef(false);
  const [composeProgress, setComposeProgress] = useState<string | null>(
    pendingComposeInitial.composeProgress,
  );
  const [composeWriteMode, setComposeWriteMode] = useState<"full" | "write_only" | null>(
    pendingComposeInitial.composeWriteMode,
  );
  const composePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const composePollArticleIdRef = useRef<string | null>(null);
  const composePollReadyGateRef = useRef(0);
  const composePollJoinedExistingJobRef = useRef(false);

  const clearComposePollInterval = useCallback(() => {
    if (composePollRef.current) {
      clearInterval(composePollRef.current);
      composePollRef.current = null;
    }
  }, []);

  const stopComposePolling = useCallback(() => {
    const pollArticleId = composePollArticleIdRef.current;
    clearComposePollInterval();
    composePollArticleIdRef.current = null;
    composePollJoinedExistingJobRef.current = false;
    if (pollArticleId) {
      clearComposePollMode(pollArticleId);
      clearComposePollSession(pollArticleId);
    }
    setWriting(false);
    setComposeProgress(null);
    setComposeWriteMode(null);
  }, [clearComposePollInterval]);

  const applyComposeStatusData = useCallback((data: ComposeStatusResponse) => {
    if (data.generated_html) setOutputHtml(data.generated_html);
    if (data.research_brief) {
      setResearchBrief((prev) =>
        data.research_brief !== prev ? data.research_brief! : prev,
      );
    }
    if (data.compose_researched_at) {
      setLastResearchedAt(data.compose_researched_at);
    }
    if (data.compose_written_at) {
      setLastWrittenAt(data.compose_written_at);
    }
    if (data.compose_phase === "full" || data.compose_phase === "write_only") {
      setResultComposePhase(data.compose_phase);
    }
    if (shouldShowComposeResearchStats(data.compose_phase)) {
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
    }
    if (typeof data.links_requested === "number") setLinksRequested(data.links_requested);
    if (typeof data.links_present === "number") setLinksPresent(data.links_present);
    if (typeof data.links_added === "number") setLinksAdded(data.links_added);
    if (typeof data.links_woven === "number" && data.links_woven > 0) {
      setLinksWovenNotice(data.links_woven);
    }
    if (shouldShowComposeLinkReworkNotices(data.compose_phase)) {
      if (typeof data.links_appended === "number" && data.links_appended > 0) {
        setLinksAppendedNotice(data.links_appended);
      }
      if (typeof data.links_redistributed === "number" && data.links_redistributed > 0) {
        setLinksRedistributedNotice(data.links_redistributed);
      }
      if (data.links_revised === true) setLinksRevisedNotice(true);
    }
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
    if (typeof data.voice_quality_warning === "string" && data.voice_quality_warning.trim()) {
      setVoiceQualityWarning(data.voice_quality_warning.trim());
    } else if (data.compose_status === "ready") {
      setVoiceQualityWarning(null);
    }
  }, []);

  const startComposePolling = useCallback(
    (
      pollArticleId: string,
      mode: "full" | "write_only" = "full",
      opts?: { readyGateAtMs?: number; joinedExistingJob?: boolean },
    ) => {
      const joinedExistingJob = opts?.joinedExistingJob === true;
      const progressLabel = joinedExistingJob
        ? composeJoinProgressLabel(mode)
        : composeProgressLabel(mode);

      if (composePollArticleIdRef.current === pollArticleId && composePollRef.current) {
        setWriting(true);
        setComposeWriteMode(mode);
        setComposeProgress(progressLabel);
        saveComposePollMode(pollArticleId, mode);
        if (joinedExistingJob) {
          composePollJoinedExistingJobRef.current = true;
        }
        return;
      }

      clearComposePollInterval();
      composePollArticleIdRef.current = pollArticleId;
      saveComposePollMode(pollArticleId, mode);
      setWriting(true);
      setComposeWriteMode(mode);
      setComposeProgress(progressLabel);
      setWriteError(null);
      composePollReadyGateRef.current = opts?.readyGateAtMs ?? Date.now();
      composePollJoinedExistingJobRef.current = joinedExistingJob;
      saveComposePollSession({
        articleId: pollArticleId,
        readyGateAtMs: composePollReadyGateRef.current,
        mode,
        joinedExistingJob,
      });

      const handleStale = () => {
        stopComposePolling();
        setWriteError(COMPOSE_STALL_MESSAGE);
      };

      const tick = async () => {
        try {
          const r = await fetch(
            `/api/writer/articles/${encodeURIComponent(pollArticleId)}/compose-status`,
            { cache: "no-store" },
          );
          const data = (await r.json().catch(() => ({}))) as ComposeStatusResponse;
          if (!r.ok) {
            if (isPollStatusRetryable(r.status)) return;
            stopComposePolling();
            setWriteError(data.error ?? `Status check failed (${r.status})`);
            return;
          }
          if (
            shouldAcceptComposePollReady(
              {
                compose_status: data.compose_status,
                compose_requested_at: data.compose_requested_at,
              },
              composePollReadyGateRef.current,
              { joinedExistingJob: composePollJoinedExistingJobRef.current },
            )
          ) {
            applyComposeStatusData(data);
            stopComposePolling();
            router.refresh();
            return;
          }
          if (data.compose_status === "ready") {
            stopComposePolling();
            setWriteError(
              "Generation overlapped with a prior run. Refresh the page, then click Write again.",
            );
            router.refresh();
            return;
          }
          if (data.compose_status === "failed") {
            stopComposePolling();
            setWriteError(data.compose_error ?? "Generation failed");
            router.refresh();
            return;
          }
          if (data.compose_status === "pending") {
            const polledMode = resolveComposePollMode(pollArticleId, {
              serverPhase: data.compose_phase,
            });
            setComposeWriteMode(polledMode);
            setComposeProgress(
              composePollJoinedExistingJobRef.current
                ? composeJoinProgressLabel(polledMode)
                : composeProgressLabel(polledMode),
            );
            saveComposePollMode(pollArticleId, polledMode);
          }
          if (
            data.compose_status === "pending" &&
            shouldStallComposePoll(
              {
                compose_status: "pending",
                compose_requested_at: data.compose_requested_at,
              },
              parseServerNowMs(data.server_now),
            )
          ) {
            handleStale();
          }
        } catch {
          // keep polling on transient network errors
        }
      };

      void tick();
      composePollRef.current = setInterval(() => void tick(), COMPOSE_POLL_INTERVAL_MS);
    },
    [applyComposeStatusData, clearComposePollInterval, router, stopComposePolling],
  );

  const resumeArticleId = selectedArticle?.id;
  const resumeComposeStatus = selectedArticle?.compose_status;
  const resumeRequestedAt = selectedArticle?.compose_requested_at;
  const resumeComposePhase = selectedArticle?.compose_phase;

  useEffect(() => {
    if (!resumeArticleId) return;

    const session = loadComposePollSession(resumeArticleId);
    if (session) {
      if (composePollArticleIdRef.current === resumeArticleId && composePollRef.current) {
        return;
      }
      startComposePolling(session.articleId, session.mode, {
        readyGateAtMs: session.readyGateAtMs,
        joinedExistingJob: session.joinedExistingJob,
      });
      return;
    }

    if (
      shouldPollCompose({
        compose_status: resumeComposeStatus,
        compose_requested_at: resumeRequestedAt,
      })
    ) {
      if (composePollArticleIdRef.current === resumeArticleId && composePollRef.current) {
        return;
      }
      const mode = resolveComposePollMode(resumeArticleId, {
        serverPhase: resumeComposePhase,
      });
      const readyGateAtMs =
        composeGenerationStartedAt({ compose_requested_at: resumeRequestedAt }) ??
        Date.now();
      startComposePolling(resumeArticleId, mode, { readyGateAtMs });
    }
  }, [
    resumeArticleId,
    resumeComposeStatus,
    resumeRequestedAt,
    resumeComposePhase,
    startComposePolling,
  ]);

  useEffect(() => {
    if (
      composePollArticleIdRef.current &&
      resumeArticleId &&
      composePollArticleIdRef.current !== resumeArticleId
    ) {
      stopComposePolling();
    }
  }, [resumeArticleId, stopComposePolling]);

  useEffect(() => {
    return () => clearComposePollInterval();
  }, [clearComposePollInterval]);

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
  const trimmedResearchBrief = researchBrief.trim();
  const staleEditorialResearchBrief =
    articleType === "how_to" &&
    trimmedResearchBrief.length >= WRITER_SOURCE_MIN_CHARS &&
    hasEditorialResearchBriefHeaders(trimmedResearchBrief);
  const canWriteFromBrief = Boolean(
    canWrite &&
      articleId &&
      trimmedResearchBrief.length >= WRITER_SOURCE_MIN_CHARS,
  );
  const showOutputColumn = Boolean(outputHtml.trim() || articleId);

  const resetComposer = useCallback(() => {
    const draftId = articleId;
    const draftStatus = articleStatus;
    setArticleId("");
    setArticleStatus("draft");
    setTitle("");
    setTopic("");
    setReferenceUrlRows([emptyReferenceUrlRow()]);
    setResearchBrief("");
    setLastResearchedAt(undefined);
    setLastWrittenAt(undefined);
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
    setArticleDepth(WRITER_ARTICLE_DEPTH_DEFAULT);
    setSubtopicsText("");
    setArticleType("editorial");
    articleTypeTouchedRef.current = false;
    if (draftId && draftStatus === "draft") {
      void deleteUnsavedWriterDraftAction(draftId);
    }
    router.push("/writer");
  }, [articleId, articleStatus, router]);

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
    if (articleTypeTouchedRef.current) return;
    setArticleType(
      resolveComposeArticleType(
        undefined,
        topic,
        parseWriterSubtopics(subtopicsText.split(/\r?\n/)),
      ),
    );
  }, [topic, subtopicsText]);

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

  async function handleWrite({ skipResearch = false }: { skipResearch?: boolean } = {}) {
    if (!canWrite) return;
    const trimmedTopic = topic.trim();
    if (trimmedTopic.length < WRITER_TOPIC_MIN_CHARS) {
      setWriteError(`Enter a topic of at least ${WRITER_TOPIC_MIN_CHARS} characters.`);
      return;
    }

    if (skipResearch) {
      if (!articleId) {
        setWriteError("Run Research and Write first to generate a research brief.");
        return;
      }
      if (trimmedResearchBrief.length < WRITER_SOURCE_MIN_CHARS) {
        setWriteError(`Research brief must be at least ${WRITER_SOURCE_MIN_CHARS} characters.`);
        return;
      }
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

    const mode = skipResearch ? "write_only" : "full";

    setWriteError(null);
    composePollJoinedExistingJobRef.current = false;
    setOutputHtml("");
    setWriting(true);
    setComposeWriteMode(mode);
    setComposeProgress(composeProgressLabel(mode));
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
    setResultComposePhase(mode);
    setVoiceQualityWarning(null);

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
          article_depth: articleDepth,
          subtopics: parseWriterSubtopics(subtopicsText.split(/\r?\n/)),
          include_faq: includeFaq,
          article_type: articleType,
          skip_research: skipResearch,
          ...(skipResearch ? { research_brief: trimmedResearchBrief } : {}),
        }),
      });
      const data = (await r.json().catch(() => ({}))) as ComposeStatusResponse & {
        accepted?: boolean;
      };
      if (!r.ok) {
        if (r.status === 409 && data.error === "compose_already_running") {
          const nextId = articleId || data.writer_article_id;
          if (nextId) {
            const readyGateAtMs =
              (await fetchComposeReadyGate(nextId)) ?? Date.now();
            startComposePolling(nextId, mode, {
              readyGateAtMs,
              joinedExistingJob: true,
            });
            return;
          }
        }
        stopComposePolling();
        setWriteError(data.error ?? "Generation failed");
        return;
      }
      if (r.status === 202 || data.compose_status === "pending") {
        const nextId = data.writer_article_id ?? articleId;
        if (nextId) {
          setArticleId(nextId);
          setArticleStatus("draft");
          let readyGateAtMs = composeGenerationStartedAt({
            compose_requested_at: data.compose_requested_at,
          });
          if (readyGateAtMs == null) {
            readyGateAtMs = (await fetchComposeReadyGate(nextId)) ?? Date.now();
          }
          startComposePolling(nextId, mode, { readyGateAtMs });
          if (nextId !== articleId) {
            router.replace(`/writer?article_id=${encodeURIComponent(nextId)}`);
          }
        } else {
          stopComposePolling();
          setWriteError("Generation accepted but no article id returned");
        }
        return;
      }
      stopComposePolling();
      applyComposeStatusData(data);
      if (data.writer_article_id) {
        setArticleId(data.writer_article_id);
        setArticleStatus("draft");
        router.push(`/writer?article_id=${encodeURIComponent(data.writer_article_id)}`);
        router.refresh();
      }
    } catch {
      stopComposePolling();
      setWriteError("Generation failed");
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
                      <span className="ml-1 text-xs font-normal text-amber-800">
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
        <p className="text-sm text-amber-800">
          No voices with a ready persona.{" "}
          <Link href="/voices" className="text-[var(--primary)] hover:underline">
            Generate a persona on Voices
          </Link>{" "}
          first.
        </p>
      ) : null}
      {voiceId && !selectedVoice?.ready ? (
        <p className="text-sm text-amber-800">
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
            Persona and style applied when you Write — after research completes.
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

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">
            Subtopics to cover (optional, one per line, up to {WRITER_SUBTOPIC_MAX})
          </span>
          <textarea
            value={subtopicsText}
            onChange={(e) => setSubtopicsText(e.target.value)}
            rows={3}
            placeholder={"Pricing models\nImplementation timeline\nCommon pitfalls"}
            className="resize-y rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          />
          <span className="text-xs text-[var(--muted)]">
            Research scoping only — what to investigate. Separate from voice keywords on the Voices page.
          </span>
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Article type</span>
          <select
            value={articleType}
            onChange={(e) => {
              articleTypeTouchedRef.current = true;
              setArticleType(e.target.value as ComposeArticleType);
            }}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          >
            <option value="editorial">Editorial</option>
            <option value="how_to">How-to</option>
          </select>
          {articleType === "how_to" ? (
            <span className="text-xs text-[var(--muted)]">
              Step-by-step tutorial with platform-specific instructions
            </span>
          ) : null}
          {staleEditorialResearchBrief ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Research brief looks editorial — run Research + Write to regenerate procedural steps.
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--muted)]">Article depth</span>
            <span className="text-xs font-medium text-[var(--muted)]">
              {writerArticleDepthLabel(articleDepth)} ({articleDepth})
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={articleDepth}
            onChange={(e) => setArticleDepth(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex justify-between text-xs text-[var(--muted)]">
            <span>Overview</span>
            <span>Standard</span>
            <span>In-depth</span>
            <span>Comprehensive</span>
          </div>
          <span className="text-xs text-[var(--muted)]">
            Controls research depth and target article length for this write.
          </span>
        </div>

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
                placeholder="Anchor text (used exactly if set)"
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
          <label className="flex items-start gap-2 text-[var(--fg)]">
            <input
              type="checkbox"
              checked={includeFaq}
              onChange={(e) => setIncludeFaq(e.target.checked)}
              disabled={writing}
              className="mt-1 accent-[var(--primary)]"
            />
            <span>
              Include FAQ section
              <span className="block text-xs text-[var(--muted)]">
                Adds a Frequently Asked Questions section with question-and-answer pairs at the end
                of the article.
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
          <Button
            type="button"
            disabled={writing || !canWrite}
            onClick={() => void handleWrite({ skipResearch: false })}
          >
            {writing && composeWriteMode === "full" ? "Researching and writing…" : "Research and Write"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={writing || !canWriteFromBrief}
            onClick={() => void handleWrite({ skipResearch: true })}
          >
            {writing && composeWriteMode === "write_only" ? "Writing…" : "Write"}
          </Button>
        </div>
        {composeProgress ? (
          <p className="text-sm text-[var(--muted)]" role="status" aria-live="polite">
            {composeProgress}
          </p>
        ) : null}
        {writeError ? <p className="text-sm text-red-300/90">{writeError}</p> : null}
        {voiceQualityWarning ? (
          <p className="ui-alert-warning text-sm" role="alert">
            <span className="font-medium">Voice quality did not fully pass.</span>{" "}
            {composeVoiceWarningDisplayMessage(voiceQualityWarning)}
          </p>
        ) : null}
        {shouldShowComposeResearchStats(resultComposePhase) &&
        (researchMode != null || researchQuestions != null) ? (
          <p className="text-xs text-[var(--muted)]">
            Research mode: {researchMode ?? "—"}
            {researchQuestions != null && researchQuestions > 0
              ? ` · ${researchQuestions} sub-questions`
              : ""}
          </p>
        ) : null}
        {shouldShowComposeResearchStats(resultComposePhase) &&
        (referencesFetched != null || referencesFailed.length > 0) ? (
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
                ? "text-amber-800"
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
              ? ` (${humanizationAttempts} rewrite attempts)`
              : ""}
          </p>
        ) : null}
        {shouldShowComposeLinkReworkNotices(resultComposePhase) && linksRevisedNotice ? (
          <p className="text-xs text-amber-800">
            Links were reworked for more natural placement in the article.
          </p>
        ) : null}
        {shouldShowComposeLinkReworkNotices(resultComposePhase) &&
        linksRedistributedNotice != null &&
        linksRedistributedNotice > 0 ? (
          <p className="text-xs text-[var(--muted)]">
            {linksRedistributedNotice} link{linksRedistributedNotice === 1 ? "" : "s"} moved earlier
            in the article for more natural placement.
          </p>
        ) : null}
        {shouldShowComposeLinkReworkNotices(resultComposePhase) &&
        linksAppendedNotice != null &&
        linksAppendedNotice > 0 ? (
          <p className="text-xs text-amber-800">
            {linksAppendedNotice} link{linksAppendedNotice === 1 ? "" : "s"} added in a Related links
            section at the end.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-[360px] flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-medium text-[var(--fg)]">Research brief</h2>
            {lastResearchedAt && researchBrief.trim() ? (
              <p className="text-xs text-[var(--muted)]">
                Last researched: <LocalDateTime iso={lastResearchedAt} />
              </p>
            ) : null}
          </div>
          <textarea
            value={researchBrief}
            onChange={(e) => setResearchBrief(e.target.value)}
            rows={16}
            readOnly={!researchBrief.trim()}
            placeholder="Generated research brief appears here after Research and Write."
            className={cn(
              articlePaneClass,
              "resize-y px-3 py-2 font-mono text-sm text-[var(--fg)]",
              researchBrief.trim() && "opacity-90",
            )}
          />
        </div>

        <div className="flex min-h-[360px] flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-medium text-[var(--fg)]">Article</h2>
              {lastWrittenAt && outputHtml.trim() ? (
                <p className="text-xs text-[var(--muted)]">
                  Last written: <LocalDateTime iso={lastWrittenAt} />
                </p>
              ) : null}
            </div>
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

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Title</span>
                <input
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2"
                />
              </label>

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
                  ? "Switch to HTML source to edit markup, then Save."
                  : "Edit in HTML source, then Save. Paste into your blog WYSIWYG (HTML mode)."}
              </p>
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

          {showOutputColumn && outputHtml.trim() ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                form="writer-compose-save-form"
                variant="primary"
                disabled={!outputHtml.trim() || !articleId}
              >
                Save article
              </Button>
              {articleId ? (
                <form
                  action={deleteWriterArticleAction}
                  onSubmit={(e) => confirmDeleteArticle(title, e)}
                >
                  <input type="hidden" name="writer_article_id" value={articleId} />
                  <Button type="submit" variant="danger" size="sm">
                    Delete article
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
