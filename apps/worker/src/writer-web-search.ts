import { env } from "./env.js";

export type WebSearchResult = {
  urls: string[];
  snippets: Map<string, string>;
};

type TavilySearchResponse = {
  results?: { url?: string; content?: string }[];
};

function normalizeHttpsUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("https://")) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

export function resolveWebSearchLimits(opts?: {
  maxQueries?: number;
  maxResults?: number;
}): { maxQueries: number; maxResults: number } {
  const requestQueries = opts?.maxQueries ?? env.writerWebSearchMaxQueries;
  const requestResults = opts?.maxResults ?? env.writerWebSearchMaxResults;
  return {
    maxQueries: Math.min(requestQueries, env.writerWebSearchMaxQueries),
    maxResults: Math.min(requestResults, env.writerWebSearchMaxResults),
  };
}

export function mergeDiscoveredUrls(
  discovered: string[],
  excludeUrls: string[],
  maxResults: number,
): string[] {
  const exclude = new Set(
    excludeUrls
      .map((u) => normalizeHttpsUrl(u.trim()) ?? u.trim())
      .filter(Boolean),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of discovered) {
    const url = normalizeHttpsUrl(raw);
    if (!url || exclude.has(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= maxResults) break;
  }
  return out;
}

export async function searchWebForTopic(
  queries: string[],
  excludeUrls: string[] = [],
  fetchFn: typeof fetch = fetch,
  limits?: { maxQueries?: number; maxResults?: number },
): Promise<WebSearchResult> {
  const key = env.tavilyApiKey?.trim();
  if (!key) {
    return { urls: [], snippets: new Map() };
  }

  const { maxQueries: maxQueriesCap, maxResults } = resolveWebSearchLimits(limits);
  const snippets = new Map<string, string>();
  const discovered: string[] = [];
  const maxQueries = Math.min(queries.length, maxQueriesCap);

  for (let i = 0; i < maxQueries && discovered.length < maxResults; i++) {
    const query = queries[i]?.trim();
    if (!query) continue;

    try {
      const r = await fetchFn("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          query,
          search_depth: "advanced",
          max_results: maxResults,
          include_answer: false,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) continue;

      const data = (await r.json()) as TavilySearchResponse;
      for (const item of data.results ?? []) {
        const url = item.url ? normalizeHttpsUrl(item.url) : null;
        if (!url) continue;
        discovered.push(url);
        if (item.content?.trim()) {
          snippets.set(url, item.content.trim().slice(0, 2000));
        }
      }
    } catch {
      // skip failed query
    }
  }

  const urls = mergeDiscoveredUrls(discovered, excludeUrls, maxResults);
  return { urls, snippets };
}

export function isWebSearchConfigured(): boolean {
  return Boolean(env.tavilyApiKey?.trim());
}
