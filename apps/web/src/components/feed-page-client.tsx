"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClearFeedButton } from "@/components/clear-feed-button";
import { FeedItemCard } from "@/components/feed-item-card";
import { GmailSyncButton } from "@/components/gmail-sync-button";
import { ContentSignalGmailAuthAlerts } from "@/components/content-signal-gmail-auth-alerts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldGroup, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PageSection } from "@/components/ui/page-section";
import { Select } from "@/components/ui/select";
import {
  fetchFeedData,
  type FeedDataLoaded,
  type FeedSearchParams,
  type FeedSort,
} from "@/lib/feed-data";

type Props = {
  searchParams: FeedSearchParams;
  workerIngestConfigured: boolean;
  sort: FeedSort;
  order: "asc" | "desc";
};

export function FeedPageClient({
  searchParams,
  workerIngestConfigured,
  sort,
  order,
}: Props) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: FeedDataLoaded }
  >({ status: "loading" });

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    }
    const result = await fetchFeedData(searchParams);
    if (!result.ok) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "ready", data: result.data });
  }, [searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedId =
    state.status === "ready"
      ? state.data.selectedId
      : searchParams.content_signal_id || searchParams.vertical_id || "";

  const filterQs = new URLSearchParams();
  if (selectedId) filterQs.set("content_signal_id", selectedId);
  if (searchParams.keyword) filterQs.set("keyword", searchParams.keyword);
  if (searchParams.min_score) filterQs.set("min_score", searchParams.min_score);
  if (searchParams.min_deal_pct) filterQs.set("min_deal_pct", searchParams.min_deal_pct);
  if (searchParams.min_deal_confidence) {
    filterQs.set("min_deal_confidence", searchParams.min_deal_confidence);
  }
  if (searchParams.has_deal === "1") filterQs.set("has_deal", "1");
  if (searchParams.full_body === "1") filterQs.set("full_body", "1");
  filterQs.set("sort", sort);
  filterQs.set("order", order);

  const data = state.status === "ready" ? state.data : null;
  const contentSignals = data?.contentSignals ?? [];
  const selectedSignal = data?.selectedSignal ?? null;
  const items = data?.items ?? [];
  const draftPostItemIds = new Set(data?.draftPostItemIds ?? []);
  const gmailOAuthSources = data?.gmailOAuthSources ?? [];

  return (
    <>
      <PageSection title="Content signal" description="Choose which signal to view and sync.">
        <form method="get" className="flex flex-wrap items-end gap-4">
          {searchParams.keyword ? (
            <input type="hidden" name="keyword" value={searchParams.keyword} />
          ) : null}
          {searchParams.min_score ? (
            <input type="hidden" name="min_score" value={searchParams.min_score} />
          ) : null}
          {searchParams.min_deal_pct ? (
            <input type="hidden" name="min_deal_pct" value={searchParams.min_deal_pct} />
          ) : null}
          {searchParams.min_deal_confidence ? (
            <input
              type="hidden"
              name="min_deal_confidence"
              value={searchParams.min_deal_confidence}
            />
          ) : null}
          {searchParams.has_deal === "1" ? (
            <input type="hidden" name="has_deal" value="1" />
          ) : null}
          {searchParams.full_body === "1" ? (
            <input type="hidden" name="full_body" value="1" />
          ) : null}
          {searchParams.sort ? (
            <input type="hidden" name="sort" value={searchParams.sort} />
          ) : null}
          {searchParams.order ? (
            <input type="hidden" name="order" value={searchParams.order} />
          ) : null}
          <FieldGroup className="min-w-[200px] flex-1">
            <Label htmlFor="feed-signal-select">Content signal</Label>
            <Select
              id="feed-signal-select"
              name="content_signal_id"
              defaultValue={selectedId}
              required
              disabled={state.status === "loading"}
            >
              {contentSignals.length === 0 ? (
                <option value="">
                  {state.status === "loading" ? "Loading signals…" : "No content signals — create one first"}
                </option>
              ) : (
                contentSignals.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name}
                  </option>
                ))
              )}
            </Select>
          </FieldGroup>
          <Button type="submit" variant="secondary" disabled={state.status === "loading"}>
            Select
          </Button>
        </form>
        {selectedId && state.status !== "loading" ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="mb-3 text-xs text-[var(--muted)]">
              {items.length} {items.length === 1 ? "item" : "items"} in feed
              {selectedSignal ? ` for ${selectedSignal.name}` : ""}
            </p>
            <div className="flex flex-wrap items-start gap-4">
              <GmailSyncButton
                contentSignalId={selectedId}
                disabled={!workerIngestConfigured || contentSignals.length === 0}
                label="Run Feed"
                busyLabel="Running feed…"
                progressMessage="Feed ingest in progress…"
                onComplete={() => void load({ silent: true })}
              />
              <ClearFeedButton
                contentSignalId={selectedId}
                contentSignalName={selectedSignal?.name ?? "Content signal"}
                itemCount={items.length}
                disabled={contentSignals.length === 0}
              />
            </div>
            {!workerIngestConfigured ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Set <code className="text-[var(--fg)]">WORKER_URL</code> on Vercel to enable feed
                ingest.
              </p>
            ) : null}
            <ContentSignalGmailAuthAlerts sources={gmailOAuthSources} />
            <p className="mt-2 text-xs text-[var(--muted)]">
              Clear feed removes ingested rows for this signal and resets the lookback cursor so the
              next feed run can pick up mail again after you change keywords, labels, or sources.
              Items older than the signal lookback ({selectedSignal?.lookback_window_hours ?? 168}h)
              are removed automatically when you run the feed.{" "}
              <Link
                href={`/content-signals/${selectedId}`}
                className="text-[var(--accent)] hover:underline"
              >
                Manage sources
              </Link>
            </p>
          </div>
        ) : null}
      </PageSection>

      <PageSection
        title="Filters"
        description="Narrow the feed by keyword, relevance, and deal strength."
      >
        <form className="grid gap-4 md:grid-cols-3 lg:grid-cols-4" method="get">
          <input type="hidden" name="content_signal_id" value={selectedId} />
          <FieldGroup>
            <Label htmlFor="feed-keyword">Keyword</Label>
            <Input
              id="feed-keyword"
              name="keyword"
              defaultValue={searchParams.keyword ?? ""}
            />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="feed-min-score">Min relevance (1–10)</Label>
            <Input
              id="feed-min-score"
              name="min_score"
              type="number"
              min={1}
              max={10}
              step={0.1}
              defaultValue={searchParams.min_score ?? ""}
            />
          </FieldGroup>
          <FieldGroup className="md:col-span-2">
            <Label htmlFor="feed-min-deal">Min deal strength (%)</Label>
            <Input
              id="feed-min-deal"
              name="min_deal_pct"
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="e.g. 50"
              defaultValue={searchParams.min_deal_pct ?? ""}
            />
            <span className="ui-caption">% off list or % bonus on spend.</span>
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="feed-sort">Sort by</Label>
            <Select id="feed-sort" name="sort" defaultValue={sort}>
              <option value="created_at">Most Recent</option>
              <option value="relevance_score">Relevance score</option>
              <option value="deal_savings">Deal strength</option>
            </Select>
          </FieldGroup>
          <input type="hidden" name="order" value={order} />
          <Button type="submit" className="md:col-span-3 lg:col-span-4">
            Apply filters
          </Button>
        </form>
      </PageSection>

      <PageSection
        title="Feed items"
        description={
          selectedId
            ? state.status === "loading"
              ? "Loading…"
              : `${items.length} items`
            : "Select a content signal above."
        }
      >
        {state.status === "loading" ? (
          <p className="text-sm text-[var(--muted)]">Loading feed items…</p>
        ) : null}

        {state.status === "error" ? (
          <Alert variant="error" className="space-y-3">
            <p>{state.message}</p>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </Alert>
        ) : null}

        {state.status === "ready" ? (
          <>
            <ul className="space-y-3">
              {items.map((it) => (
                <li key={it.id}>
                  <FeedItemCard
                    item={it}
                    variant="feed"
                    contentSignalId={selectedId}
                    workerIngestConfigured={workerIngestConfigured}
                    alreadyInPosts={draftPostItemIds.has(it.id)}
                  />
                </li>
              ))}
            </ul>
            {items.length === 0 ? (
              <EmptyState
                message={
                  selectedId
                    ? "No items yet. Sync sources or adjust filters."
                    : "Select a content signal above."
                }
              />
            ) : null}
          </>
        ) : null}
      </PageSection>
    </>
  );
}
