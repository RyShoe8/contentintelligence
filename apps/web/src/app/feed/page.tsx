import Link from "next/link";
import { ensureIndexes, listContentSignals, listPosts, listSignalItems } from "@content-resourcer/db";
import { ClearFeedButton } from "@/components/clear-feed-button";
import { FeedItemCard } from "@/components/feed-item-card";
import { GmailSyncButton } from "@/components/gmail-sync-button";
import { ContentSignalGmailAuthAlerts } from "@/components/content-signal-gmail-auth-alerts";
import { connectMongo } from "@/lib/mongo";
import { loadContentSignalGmailOAuth } from "@/lib/content-signal-gmail-oauth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldGroup, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageSection } from "@/components/ui/page-section";
import { Select } from "@/components/ui/select";
import { requireOrgMember } from "@/lib/org-auth";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
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
  }>;
}) {
  const sp = await searchParams;
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);
  const contentSignals = await listContentSignals(db, { organizationId: orgId });
  const selectedId = sp.content_signal_id || sp.vertical_id || contentSignals[0]?.id || "";
  const selectedSignal = contentSignals.find((cs) => cs.id === selectedId);
  const workerIngestConfigured = !!process.env.WORKER_URL;
  const clearedCount = sp.cleared ? Number(sp.cleared) : null;

  const sort =
    sp.sort === "relevance_score"
      ? "relevance_score"
      : sp.sort === "deal_savings"
        ? "deal_savings"
        : "created_at";
  const order: "asc" | "desc" =
    sort === "created_at" ? "desc" : sp.order === "asc" ? "asc" : "desc";
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

  const items = selectedId
    ? await listSignalItems(db, {
        organizationId: orgId,
        content_signal_id: selectedId,
        keyword: sp.keyword || undefined,
        min_score: Number.isFinite(min_score) ? min_score : undefined,
        min_effective_savings_pct,
        min_confidence,
        has_deal_metrics: has_deal_metrics || undefined,
        max_age_hours: selectedSignal?.lookback_window_hours,
        sort,
        order,
        limit: 100,
      })
    : [];

  const draftPosts = selectedId
    ? await listPosts(db, {
        organizationId: orgId,
        content_signal_id: selectedId,
        status: "draft",
      })
    : [];
  const itemIdsInPosts = new Set(draftPosts.map((p) => p.signal_item_id));

  const gmailOAuthSources = selectedId
    ? await loadContentSignalGmailOAuth(db, selectedId)
    : [];

  const filterQs = new URLSearchParams();
  if (selectedId) filterQs.set("content_signal_id", selectedId);
  if (sp.keyword) filterQs.set("keyword", sp.keyword);
  if (sp.min_score) filterQs.set("min_score", sp.min_score);
  if (sp.min_deal_pct) filterQs.set("min_deal_pct", sp.min_deal_pct);
  if (sp.min_deal_confidence) filterQs.set("min_deal_confidence", sp.min_deal_confidence);
  if (sp.has_deal === "1") filterQs.set("has_deal", "1");
  if (sp.full_body === "1") filterQs.set("full_body", "1");
  filterQs.set("sort", sort);
  filterQs.set("order", order);
  const toggleOrderHref = `/feed?${new URLSearchParams({ ...Object.fromEntries(filterQs), order: order === "desc" ? "asc" : "desc" }).toString()}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signal feed"
        description="Select a content signal, sync its sources, then filter results below."
        actions={
          sort !== "created_at" ? (
            <Link href={toggleOrderHref} className="text-sm font-medium text-[var(--primary)] hover:underline">
              Toggle sort ({order === "desc" ? "desc" : "asc"})
            </Link>
          ) : (
            <span className="text-sm text-[var(--muted)]">Newest first</span>
          )
        }
      />

      {clearedCount !== null && Number.isFinite(clearedCount) ? (
        <Alert variant="success">
          Cleared {clearedCount} feed {clearedCount === 1 ? "item" : "items"} for{" "}
          <strong>{selectedSignal?.name ?? "this signal"}</strong>. Run Sync now to re-ingest.
        </Alert>
      ) : null}
      {sp.error === "not_found" ? <Alert variant="error">Content signal not found.</Alert> : null}

      <PageSection title="Content signal" description="Choose which signal to view and sync.">
        <form method="get" className="flex flex-wrap items-end gap-4">
          {sp.keyword ? <input type="hidden" name="keyword" value={sp.keyword} /> : null}
          {sp.min_score ? <input type="hidden" name="min_score" value={sp.min_score} /> : null}
          {sp.min_deal_pct ? <input type="hidden" name="min_deal_pct" value={sp.min_deal_pct} /> : null}
          {sp.min_deal_confidence ? (
            <input type="hidden" name="min_deal_confidence" value={sp.min_deal_confidence} />
          ) : null}
          {sp.has_deal === "1" ? <input type="hidden" name="has_deal" value="1" /> : null}
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="order" value={order} />
          <FieldGroup className="min-w-[200px] flex-1">
            <Label htmlFor="feed-signal-select">Content signal</Label>
            <Select id="feed-signal-select" name="content_signal_id" defaultValue={selectedId} required>
              {contentSignals.length === 0 ? (
                <option value="">No content signals — create one first</option>
              ) : (
                contentSignals.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name}
                  </option>
                ))
              )}
            </Select>
          </FieldGroup>
          <Button type="submit" variant="secondary">
            Select
          </Button>
        </form>
        {selectedId ? (
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
                Set <code className="text-[var(--fg)]">WORKER_URL</code> on Vercel to enable feed ingest.
              </p>
            ) : null}
            <ContentSignalGmailAuthAlerts sources={gmailOAuthSources} />
            <p className="mt-2 text-xs text-[var(--muted)]">
              Clear feed removes ingested rows for this signal and resets the lookback cursor so the next
              feed run can pick up mail again after you change keywords, labels, or sources. Items older than
              the signal lookback ({selectedSignal?.lookback_window_hours ?? 168}h) are removed
              automatically when you run the feed.{" "}
              <Link href={`/content-signals/${selectedId}`} className="text-[var(--accent)] hover:underline">
                Manage sources
              </Link>
            </p>
          </div>
        ) : null}
      </PageSection>

      <PageSection title="Filters" description="Narrow the feed by keyword, relevance, and deal strength.">
      <form className="grid gap-4 md:grid-cols-3 lg:grid-cols-4" method="get">
        <input type="hidden" name="content_signal_id" value={selectedId} />
        <FieldGroup>
          <Label htmlFor="feed-keyword">Keyword</Label>
          <Input id="feed-keyword" name="keyword" defaultValue={sp.keyword ?? ""} />
        </FieldGroup>
        <FieldGroup>
          <Label htmlFor="feed-min-score">Min relevance (1–10)</Label>
          <Input id="feed-min-score" name="min_score" type="number" min={1} max={10} step={0.1} defaultValue={sp.min_score ?? ""} />
        </FieldGroup>
        <FieldGroup className="md:col-span-2">
          <Label htmlFor="feed-min-deal">Min deal strength (%)</Label>
          <Input id="feed-min-deal" name="min_deal_pct" type="number" min={0} max={100} step={1} placeholder="e.g. 50" defaultValue={sp.min_deal_pct ?? ""} />
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

      <PageSection title="Feed items" description={selectedId ? `${items.length} items` : "Select a content signal above."}>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id}>
            <FeedItemCard
              item={it}
              variant="feed"
              contentSignalId={selectedId}
              workerIngestConfigured={workerIngestConfigured}
              alreadyInPosts={itemIdsInPosts.has(it.id)}
            />
          </li>
        ))}
      </ul>
      {items.length === 0 ? (
        <EmptyState message={selectedId ? "No items yet. Sync sources or adjust filters." : "Select a content signal above."} />
      ) : null}
      </PageSection>
    </div>
  );
}
