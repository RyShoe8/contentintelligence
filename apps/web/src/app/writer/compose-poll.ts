/** Compose generation is considered stalled after this many ms without ready/failed. */
export const COMPOSE_STALE_MS = 15 * 60 * 1000;

/** Pending jobs with no output progress are likely orphaned after worker restart. */
export const COMPOSE_ORPHAN_MS = 4 * 60 * 1000;

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

function toTimestamp(raw: Date | string | null | undefined): number | null {
  if (raw == null) return null;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

export function composeGenerationStartedAt(article: ComposePollArticleFields): number | null {
  return toTimestamp(article.compose_requested_at);
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

export function isComposePendingOrphan(
  article: ComposeOrphanCheckFields,
  nowMs: number = Date.now(),
): boolean {
  if (article.compose_status !== "pending") return false;
  const started = composeGenerationStartedAt(article);
  if (started == null) return false;
  if (nowMs - started <= COMPOSE_ORPHAN_MS) return false;
  const html = article.generated_html?.trim();
  if (html) return false;
  return true;
}

/**
 * Whether the UI should poll compose-status and show the writing spinner.
 */
export function shouldPollCompose(article: ComposePollArticleFields): boolean {
  if (article.compose_status !== "pending") return false;
  const started = composeGenerationStartedAt(article);
  if (started == null) return false;
  return Date.now() - started <= COMPOSE_STALE_MS;
}

/** Ignore stale ready from a prior compose run when polling a new generation. */
export function isComposeReadyForPoll(
  article: ComposePollArticleFields & { compose_status?: string },
  pollStartedAtMs: number,
): boolean {
  if (article.compose_status !== "ready") return false;
  const requested = composeGenerationStartedAt(article);
  if (requested == null) return true;
  return requested >= pollStartedAtMs - COMPOSE_READY_CLOCK_BUFFER_MS;
}

export function composeProgressLabel(mode: ComposePollMode): string {
  return mode === "write_only" ? "Writing…" : "Researching and writing…";
}

export function composePollModeStorageKey(articleId: string): string {
  return `writer-compose-poll-mode:${articleId}`;
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
