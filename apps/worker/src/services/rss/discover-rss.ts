/**
 * Probes a base URL for an RSS/Atom feed.
 * Strategy:
 * 1. Check HTML <link rel="alternate" type="application/rss+xml|atom+xml">
 * 2. Try common feed paths: /feed, /rss, /feed.xml, /rss.xml, /atom.xml
 */

const FEED_PATHS = [
  "/feed",
  "/rss",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/feed/",
];

const FEED_CONTENT_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
];

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ContentIntelligence/1.0 RSS Discovery" },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractFeedLinksFromHtml(html: string, baseUrl: string): string[] {
  const feedUrls: string[] = [];
  // Match <link rel="alternate" type="application/rss+xml" href="...">
  const linkRe = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  const hrefRe = /href=["']([^"']+)["']/i;
  const typeRe = /type=["']([^"']+)["']/i;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const tag = match[0];
    const typeMatch = typeRe.exec(tag);
    if (!typeMatch) continue;
    const type = typeMatch[1].toLowerCase();
    if (!FEED_CONTENT_TYPES.some((t) => type.includes(t.split("/")[1]))) continue;
    const hrefMatch = hrefRe.exec(tag);
    if (!hrefMatch) continue;
    try {
      const resolved = new URL(hrefMatch[1], baseUrl).href;
      feedUrls.push(resolved);
    } catch {
      // ignore bad URLs
    }
  }
  return feedUrls;
}

async function isValidFeed(url: string): Promise<boolean> {
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return false;
  const text = await res.text().catch(() => "");
  return text.includes("<rss") || text.includes("<feed") || text.includes("<channel");
}

export async function discoverRssFeed(pageUrl: string): Promise<string | null> {
  // Step 1: Fetch homepage HTML and look for <link rel="alternate">
  const res = await fetchWithTimeout(pageUrl);
  if (res && res.ok) {
    const html = await res.text().catch(() => "");
    const fromLinks = extractFeedLinksFromHtml(html, pageUrl);
    for (const feedUrl of fromLinks) {
      if (await isValidFeed(feedUrl)) return feedUrl;
    }
  }

  // Step 2: Try common feed paths
  const base = new URL(pageUrl);
  const baseOrigin = `${base.protocol}//${base.host}`;
  for (const path of FEED_PATHS) {
    const candidate = `${baseOrigin}${path}`;
    if (await isValidFeed(candidate)) return candidate;
  }

  return null;
}
