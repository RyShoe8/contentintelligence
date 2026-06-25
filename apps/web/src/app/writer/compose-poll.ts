/** Compose generation is considered stalled after this many ms without ready/failed. */
export const COMPOSE_STALE_MS = 30 * 60 * 1000;

/** Pending jobs likely orphaned after worker restart (aligned with stale window). */
export const COMPOSE_ORPHAN_MS = COMPOSE_STALE_MS;

/** Client clock may be slightly ahead of server compose_requested_at. */
export const COMPOSE_READY_CLOCK_BUFFER_MS = 5000;

export const COMPOSE_STALL_MESSAGE =
  "Generation was interrupted or timed out. Click Write again to retry.";

export type ComposePollMode = "full" | "write_only";

export type ComposePollArticleFields = {
  compose_status?: string;
  compose_requested_at?: Date | string | null;
  updated_at?: Date | string | null;
};

export type ComposeOrphanCheckFields = ComposePollArticleFields & {
  generated_html?: string | null;
};

export type ComposePollSession = {
  articleId: string;
  readyGateAtMs: number;
  mode: ComposePollMode;
  joinedExistingJob: boolean;
};

function toTimestamp(raw: Date | string | null | undefined): number | null {
  if (raw == null) return null;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

export function composeGenerationStartedAt(article: ComposePollArticleFields): number | null {
  return toTimestamp(article.compose_requested_at);
}

export function parseServerNowMs(serverNow: Date | string | null | undefined): number | null {
  return toTimestamp(serverNow);
}

export function isComposePendingStale(
  article: ComposePollArticleFields,
  nowMs: number = Date.now(),
): boolean {
  if (article.compose_status !== "pending") return false;
  const started = composeGenerationStartedAt(article);
  if (started != null) return nowMs - started > COMPOSE_STALE_MS;
  const updated = toTimestamp(article.updated_at);
  if (updated == null) return false;
  return nowMs - updated > COMPOSE_STALE_MS;
}

/** Stall pending compose using server time when available (avoids client clock skew). */
export function shouldStallComposePoll(
  article: ComposePollArticleFields,
  serverNowMs?: number | null,
): boolean {
  const nowMs = serverNowMs ?? Date.now();
  return isComposePendingStale(article, nowMs);
}

export function isComposePendingOrphan(
  article: ComposeOrphanCheckFields,
  nowMs: number = Date.now(),
): boolean {
  if (article.compose_status !== "pending") return false;
  const started = composeGenerationStartedAt(article);
  if (started == null) return false;
  return nowMs - started > COMPOSE_ORPHAN_MS;
}

/**
 * Whether the UI should poll compose-status and show the writing spinner.
 */
export function shouldPollCompose(
  article: ComposePollArticleFields,
  nowMs: number = Date.now(),
): boolean {
  if (article.compose_status !== "pending") return false;
  const started = composeGenerationStartedAt(article);
  if (started == null) return false;
  return nowMs - started <= COMPOSE_STALE_MS;
}

/** HTTP statuses where poll clients should retry instead of stopping. */
export function isPollStatusRetryable(httpStatus: number): boolean {
  return httpStatus === 503 || httpStatus === 502 || httpStatus === 504;
}

/** Ignore stale ready from a prior compose run when polling a new generation. */
export function isComposeReadyForPoll(
  article: ComposePollArticleFields & { compose_status?: string },
  readyGateAtMs: number,
): boolean {
  if (article.compose_status !== "ready") return false;
  const requested = composeGenerationStartedAt(article);
  if (requested == null) return true;
  return requested >= readyGateAtMs - COMPOSE_READY_CLOCK_BUFFER_MS;
}

/** Accept ready when polling an in-flight job joined via compose_already_running (409). */
export function shouldAcceptComposePollReady(
  article: ComposePollArticleFields & { compose_status?: string },
  readyGateAtMs: number,
  opts?: { joinedExistingJob?: boolean },
): boolean {
  if (article.compose_status !== "ready") return false;
  if (isComposeReadyForPoll(article, readyGateAtMs)) return true;
  if (!opts?.joinedExistingJob) return false;
  const requested = composeGenerationStartedAt(article);
  if (requested == null) return true;
  return requested <= readyGateAtMs + COMPOSE_READY_CLOCK_BUFFER_MS;
}

export function composeProgressLabel(mode: ComposePollMode): string {
  return mode === "write_only" ? "Writing…" : "Researching and writing…";
}

export function composeJoinProgressLabel(mode: ComposePollMode): string {
  return mode === "write_only"
    ? "Joining in-progress generation…"
    : "Joining in-progress research and writing…";
}

export function composePollModeStorageKey(articleId: string): string {
  return `writer-compose-poll-mode:${articleId}`;
}

export function composePollSessionStorageKey(articleId: string): string {
  return `writer-compose-poll-session:${articleId}`;
}

export function saveComposePollMode(articleId: string, mode: ComposePollMode): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(composePollModeStorageKey(articleId), mode);
}

export function storedComposePollMode(articleId: string): ComposePollMode | null {
  if (typeof sessionStorage === "undefined") return null;
  const value = sessionStorage.getItem(composePollModeStorageKey(articleId));
  return value === "full" || value === "write_only" ? value : null;
}

export function clearComposePollMode(articleId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(composePollModeStorageKey(articleId));
}

export function saveComposePollSession(session: ComposePollSession): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(
    composePollSessionStorageKey(session.articleId),
    JSON.stringify(session),
  );
}

export function loadComposePollSession(articleId: string): ComposePollSession | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(composePollSessionStorageKey(articleId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ComposePollSession;
    if (
      parsed.articleId !== articleId ||
      typeof parsed.readyGateAtMs !== "number" ||
      (parsed.mode !== "full" && parsed.mode !== "write_only")
    ) {
      return null;
    }
    return {
      articleId: parsed.articleId,
      readyGateAtMs: parsed.readyGateAtMs,
      mode: parsed.mode,
      joinedExistingJob: parsed.joinedExistingJob === true,
    };
  } catch {
    return null;
  }
}

export function clearComposePollSession(articleId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(composePollSessionStorageKey(articleId));
}

export type ComposeResultPhase = "full" | "write_only";

/** Research stats apply only after a full Research and Write run. */
export function shouldShowComposeResearchStats(phase: ComposeResultPhase | null | undefined): boolean {
  return phase === "full";
}

/** Link rework notices apply only after full compose (Write-only shows links + scores only). */
export function shouldShowComposeLinkReworkNotices(
  phase: ComposeResultPhase | null | undefined,
): boolean {
  return phase === "full";
}

export function resolveComposePollMode(
  articleId: string,
  opts?: {
    serverPhase?: ComposePollMode | null;
    fallback?: ComposePollMode;
  },
): ComposePollMode {
  const fallback = opts?.fallback ?? "full";
  if (opts?.serverPhase === "full" || opts?.serverPhase === "write_only") {
    return opts.serverPhase;
  }
  return storedComposePollMode(articleId) ?? fallback;
}
