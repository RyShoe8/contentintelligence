/** Short label for a long tracking URL (hostname + truncated path). */
export function formatDealUrlDisplay(url: string, maxLen = 72): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const path = `${u.pathname}${u.search}`;
    const full = path && path !== "/" ? `${host}${path}` : host;
    if (full.length <= maxLen) return full;
    return `${full.slice(0, maxLen - 1)}…`;
  } catch {
    return url.length <= maxLen ? url : `${url.slice(0, maxLen - 1)}…`;
  }
}
