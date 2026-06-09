/** Compose generation is considered stalled after this many ms without ready/failed. */
export const COMPOSE_STALE_MS = 15 * 60 * 1000;

export type ComposePollArticleFields = {
  compose_status?: string;
  compose_requested_at?: Date | string | null;
  updated_at?: Date | string | null;
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

/**
 * Whether the UI should poll compose-status and show the writing spinner.
 */
export function shouldPollCompose(article: ComposePollArticleFields): boolean {
  if (article.compose_status !== "pending") return false;
  const started = composeGenerationStartedAt(article);
  if (started == null) return false;
  return Date.now() - started <= COMPOSE_STALE_MS;
}
