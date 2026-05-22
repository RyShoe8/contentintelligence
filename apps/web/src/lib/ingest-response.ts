/** Strip gateway HTML error pages into a short user-facing message. */
export function sanitizeIngestError(raw: unknown): string {
  if (typeof raw !== "string") {
    if (raw && typeof raw === "object" && "message" in raw) {
      const m = (raw as { message: unknown }).message;
      if (typeof m === "string") return sanitizeIngestError(m);
    }
    if (raw && typeof raw === "object" && "error" in raw) {
      const e = (raw as { error: unknown }).error;
      if (typeof e === "string") return sanitizeIngestError(e);
    }
    return "Sync failed";
  }
  const t = raw.trim();
  if (t.length === 0) return "Sync failed";
  if (/^<!DOCTYPE/i.test(t) || /<html[\s>]/i.test(t)) {
    if (/\b502\b/i.test(t)) {
      return "Sync timed out at the server gateway. Try again in a minute, or refresh the feed — the worker may still be processing.";
    }
    if (/\b504\b/i.test(t)) {
      return "Sync timed out. Refresh the feed in a minute to check for new items.";
    }
    return "Sync failed (server returned an error page). Try again in a minute.";
  }
  if (t.length > 280) return `${t.slice(0, 280)}…`;
  return t;
}
