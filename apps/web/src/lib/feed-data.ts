import type { ContentSignal, SignalItemFeedRow } from "@content-resourcer/db/schemas";
import type { ContentSignalSourceOAuth } from "@/components/content-signal-gmail-auth-alerts";

export type FeedSearchParams = {
  content_signal_id?: string;
  vertical_id?: string;
  keyword?: string;
  min_score?: string;
  min_deal_pct?: string;
  min_deal_confidence?: string;
  has_deal?: string;
  full_body?: string;
  sort?: string;
  order?: string;
  cleared?: string;
  error?: string;
};

export type FeedSort = "created_at" | "relevance_score" | "deal_savings";

export function parseFeedSort(sp: FeedSearchParams): FeedSort {
  if (sp.sort === "relevance_score") return "relevance_score";
  if (sp.sort === "deal_savings") return "deal_savings";
  return "created_at";
}

export function parseFeedOrder(sp: FeedSearchParams, sort: FeedSort): "asc" | "desc" {
  if (sort === "created_at") return "desc";
  return sp.order === "asc" ? "asc" : "desc";
}

export function parseFeedNumericFilters(sp: FeedSearchParams) {
  const min_score = sp.min_score ? Number(sp.min_score) : undefined;
  const minDealPctRaw = sp.min_deal_pct ? Number(sp.min_deal_pct) : undefined;
  const min_effective_savings_pct =
    Number.isFinite(minDealPctRaw) && minDealPctRaw! >= 0 && minDealPctRaw! <= 100
      ? minDealPctRaw! / 100
      : undefined;
  const minConfRaw = sp.min_deal_confidence ? Number(sp.min_deal_confidence) : undefined;
  const min_confidence =
    Number.isFinite(minConfRaw) && minConfRaw! >= 0 && minConfRaw! <= 1 ? minConfRaw : undefined;
  const has_deal_metrics = sp.has_deal === "1";

  return {
    min_score: Number.isFinite(min_score) ? min_score : undefined,
    min_effective_savings_pct,
    min_confidence,
    has_deal_metrics,
  };
}

export function feedDataQueryString(sp: FeedSearchParams): string {
  const qs = new URLSearchParams();
  if (sp.content_signal_id) qs.set("content_signal_id", sp.content_signal_id);
  if (sp.vertical_id) qs.set("vertical_id", sp.vertical_id);
  if (sp.keyword) qs.set("keyword", sp.keyword);
  if (sp.min_score) qs.set("min_score", sp.min_score);
  if (sp.min_deal_pct) qs.set("min_deal_pct", sp.min_deal_pct);
  if (sp.min_deal_confidence) qs.set("min_deal_confidence", sp.min_deal_confidence);
  if (sp.has_deal === "1") qs.set("has_deal", "1");
  if (sp.sort) qs.set("sort", sp.sort);
  if (sp.order) qs.set("order", sp.order);
  return qs.toString();
}

export type FeedDataResponseJson = {
  contentSignals: SerializedContentSignal[];
  selectedId: string;
  selectedSignal: SerializedContentSignal | null;
  items: SerializedSignalItemFeedRow[];
  draftPostItemIds: string[];
  gmailOAuthSources: SerializedGmailOAuthSource[];
};

type SerializedContentSignal = Omit<
  ContentSignal,
  "last_ingest_completed_at" | "last_ingest_attempt_at" | "created_at" | "updated_at"
> & {
  last_ingest_completed_at?: string | null;
  last_ingest_attempt_at?: string | null;
  created_at: string;
  updated_at: string;
};

type SerializedSignalItemFeedRow = Omit<SignalItemFeedRow, "email_sent_at" | "created_at"> & {
  email_sent_at?: string;
  created_at: string;
};

type SerializedGmailOAuthSource = Omit<
  ContentSignalSourceOAuth,
  "refreshTokenIssuedAt" | "updatedAt"
> & {
  refreshTokenIssuedAt: string | null;
  updatedAt: string | null;
};

export type FeedDataLoaded = {
  contentSignals: ContentSignal[];
  selectedId: string;
  selectedSignal: ContentSignal | null;
  items: SignalItemFeedRow[];
  draftPostItemIds: string[];
  gmailOAuthSources: ContentSignalSourceOAuth[];
};

export function parseFeedDataResponse(json: FeedDataResponseJson): FeedDataLoaded {
  return {
    contentSignals: json.contentSignals.map(parseContentSignal),
    selectedId: json.selectedId,
    selectedSignal: json.selectedSignal ? parseContentSignal(json.selectedSignal) : null,
    items: json.items.map(parseFeedItem),
    draftPostItemIds: json.draftPostItemIds,
    gmailOAuthSources: json.gmailOAuthSources.map(parseGmailOAuthSource),
  };
}

function parseContentSignal(cs: SerializedContentSignal): ContentSignal {
  return {
    ...cs,
    last_ingest_completed_at: cs.last_ingest_completed_at
      ? new Date(cs.last_ingest_completed_at)
      : undefined,
    last_ingest_attempt_at: cs.last_ingest_attempt_at
      ? new Date(cs.last_ingest_attempt_at)
      : undefined,
    created_at: new Date(cs.created_at),
    updated_at: new Date(cs.updated_at),
  };
}

function parseFeedItem(item: SerializedSignalItemFeedRow): SignalItemFeedRow {
  return {
    ...item,
    email_sent_at: item.email_sent_at ? new Date(item.email_sent_at) : undefined,
    created_at: new Date(item.created_at),
  };
}

function parseGmailOAuthSource(source: SerializedGmailOAuthSource): ContentSignalSourceOAuth {
  return {
    ...source,
    refreshTokenIssuedAt: source.refreshTokenIssuedAt
      ? new Date(source.refreshTokenIssuedAt)
      : null,
    updatedAt: source.updatedAt ? new Date(source.updatedAt) : null,
  };
}

export async function fetchFeedData(
  sp: FeedSearchParams,
  attempt = 0,
): Promise<{ ok: true; data: FeedDataLoaded } | { ok: false; error: string }> {
  const qs = feedDataQueryString(sp);
  const retryDelays = [1000, 2000];

  try {
    const r = await fetch(`/api/feed/data?${qs}`, { cache: "no-store" });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      const message = body.error ?? `Feed data request failed (${r.status})`;
      if (attempt < retryDelays.length) {
        await sleep(retryDelays[attempt]);
        return fetchFeedData(sp, attempt + 1);
      }
      return { ok: false, error: message };
    }
    const json = (await r.json()) as FeedDataResponseJson;
    return { ok: true, data: parseFeedDataResponse(json) };
  } catch {
    if (attempt < retryDelays.length) {
      await sleep(retryDelays[attempt]);
      return fetchFeedData(sp, attempt + 1);
    }
    return { ok: false, error: "Could not load feed data. Check your connection and try again." };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
