import {
  listContentSignals,
  listPosts,
  listSignalItemsForFeed,
  type ContentSignal,
  type SignalItemFeedRow,
} from "@content-resourcer/db";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { ContentSignalSourceOAuth } from "@/components/content-signal-gmail-auth-alerts";
import {
  parseFeedNumericFilters,
  parseFeedOrder,
  parseFeedSort,
  type FeedDataResponseJson,
  type FeedSearchParams,
} from "@/lib/feed-data";
import { loadContentSignalGmailOAuth } from "@/lib/content-signal-gmail-oauth";
import { withFreshMongo } from "@/lib/mongo";

export const maxDuration = 60;

function serializeContentSignal(cs: ContentSignal) {
  return {
    ...cs,
    last_ingest_completed_at: cs.last_ingest_completed_at?.toISOString() ?? null,
    last_ingest_attempt_at: cs.last_ingest_attempt_at?.toISOString() ?? null,
    created_at: cs.created_at.toISOString(),
    updated_at: cs.updated_at.toISOString(),
  };
}

function serializeFeedItem(item: SignalItemFeedRow) {
  return {
    ...item,
    email_sent_at: item.email_sent_at?.toISOString(),
    created_at: item.created_at.toISOString(),
  };
}

function serializeGmailOAuthSource(source: ContentSignalSourceOAuth) {
  return {
    ...source,
    refreshTokenIssuedAt: source.refreshTokenIssuedAt?.toISOString() ?? null,
    updatedAt: source.updatedAt?.toISOString() ?? null,
  };
}

function searchParamsFromUrl(url: URL): FeedSearchParams {
  return {
    content_signal_id: url.searchParams.get("content_signal_id") ?? undefined,
    vertical_id: url.searchParams.get("vertical_id") ?? undefined,
    keyword: url.searchParams.get("keyword") ?? undefined,
    min_score: url.searchParams.get("min_score") ?? undefined,
    min_deal_pct: url.searchParams.get("min_deal_pct") ?? undefined,
    min_deal_confidence: url.searchParams.get("min_deal_confidence") ?? undefined,
    has_deal: url.searchParams.get("has_deal") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    order: url.searchParams.get("order") ?? undefined,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  const orgId = session?.user?.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = searchParamsFromUrl(new URL(req.url));
  const sort = parseFeedSort(sp);
  const order = parseFeedOrder(sp, sort);
  const { min_score, min_effective_savings_pct, min_confidence, has_deal_metrics } =
    parseFeedNumericFilters(sp);

  try {
    const payload = await withFreshMongo(async (db) => {
      const contentSignals = await listContentSignals(db, { organizationId: orgId });
      const selectedId =
        sp.content_signal_id || sp.vertical_id || contentSignals[0]?.id || "";
      const selectedSignal = contentSignals.find((cs) => cs.id === selectedId) ?? null;

      if (!selectedId) {
        return {
          contentSignals,
          selectedId,
          selectedSignal,
          items: [] as SignalItemFeedRow[],
          draftPostItemIds: [] as string[],
          gmailOAuthSources: [] as ContentSignalSourceOAuth[],
        };
      }

      const items = await listSignalItemsForFeed(db, {
        organizationId: orgId,
        content_signal_id: selectedId,
        keyword: sp.keyword || undefined,
        min_score,
        min_effective_savings_pct,
        min_confidence,
        has_deal_metrics: has_deal_metrics || undefined,
        max_age_hours: selectedSignal?.lookback_window_hours,
        sort,
        order,
        limit: 100,
      });

      let draftPostItemIds: string[] = [];
      try {
        const draftPosts = await listPosts(db, {
          organizationId: orgId,
          content_signal_id: selectedId,
          status: "draft",
        });
        draftPostItemIds = draftPosts.map((p) => p.signal_item_id);
      } catch {
        // Non-critical: badge only.
      }

      let gmailOAuthSources: ContentSignalSourceOAuth[] = [];
      try {
        gmailOAuthSources = await loadContentSignalGmailOAuth(db, selectedId);
      } catch {
        // Non-critical: OAuth alerts only.
      }

      return {
        contentSignals,
        selectedId,
        selectedSignal,
        items,
        draftPostItemIds,
        gmailOAuthSources,
      };
    });

    const body: FeedDataResponseJson = {
      contentSignals: payload.contentSignals.map(serializeContentSignal),
      selectedId: payload.selectedId,
      selectedSignal: payload.selectedSignal
        ? serializeContentSignal(payload.selectedSignal)
        : null,
      items: payload.items.map(serializeFeedItem),
      draftPostItemIds: payload.draftPostItemIds,
      gmailOAuthSources: payload.gmailOAuthSources.map(serializeGmailOAuthSource),
    };

    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "feed_data_failed";
    console.error("[api/feed/data]", e);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
