import Link from "next/link";
import { ensureIndexes, listContentSignals, listPosts, listSignalItems } from "@content-resourcer/db";
import { EmailImageGallery } from "@/components/email-image-gallery";
import { AddToPostsButton } from "@/components/add-to-posts-button";
import { ClearFeedButton } from "@/components/clear-feed-button";
import { GmailSyncButton } from "@/components/gmail-sync-button";
import { connectMongo } from "@/lib/mongo";
import { DealsList } from "@/components/deals-list";
import { DealLinkRow } from "@/components/deal-link-row";
import { KeyPointsList } from "@/components/key-points-list";
import { dealsForDisplay, hasDeal } from "@/lib/deal-display";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Signal feed</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Select a content signal, sync its sources, then filter results below.
          </p>
        </div>
        {sort !== "created_at" ? (
          <Link href={toggleOrderHref} className="text-sm text-[var(--accent)]">
            Toggle sort direction ({order === "desc" ? "descending" : "ascending"})
          </Link>
        ) : (
          <span className="text-sm text-[var(--muted)]">Newest first</span>
        )}
      </div>

      {clearedCount !== null && Number.isFinite(clearedCount) ? (
        <p className="rounded-md border border-green-700/40 bg-green-900/20 px-3 py-2 text-sm text-green-200">
          Cleared {clearedCount} feed {clearedCount === 1 ? "item" : "items"} for{" "}
          <strong>{selectedSignal?.name ?? "this signal"}</strong>. Run Sync now to re-ingest.
        </p>
      ) : null}
      {sp.error === "not_found" ? (
        <p className="rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
          Content signal not found.
        </p>
      ) : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
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
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Content signal</span>
            <select
              name="content_signal_id"
              defaultValue={selectedId}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
              required
            >
              {contentSignals.length === 0 ? (
                <option value="">No content signals — create one first</option>
              ) : (
                contentSignals.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="submit"
            className="rounded border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)]"
          >
            Select
          </button>
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
      </section>

      <form
        className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-3 lg:grid-cols-4"
        method="get"
      >
        <input type="hidden" name="content_signal_id" value={selectedId} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Keyword</span>
          <input
            name="keyword"
            defaultValue={sp.keyword ?? ""}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Min relevance (1–10)</span>
          <input
            name="min_score"
            type="number"
            min={1}
            max={10}
            step={0.1}
            defaultValue={sp.min_score ?? ""}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Min deal strength (%)</span>
          <input
            name="min_deal_pct"
            type="number"
            min={0}
            max={100}
            step={1}
            placeholder="e.g. 50"
            defaultValue={sp.min_deal_pct ?? ""}
            title="Passes if % off list or % bonus on spend (same units only). Mixed USD/SC offers are excluded."
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          />
          <span className="text-xs text-[var(--muted)]">
            % off list or % bonus on spend (includes USD → SC offers when a bonus % can be computed).
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Sort by</span>
          <select
            name="sort"
            defaultValue={sort}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          >
            <option value="created_at">Most Recent</option>
            <option value="relevance_score">Relevance score</option>
            <option value="deal_savings">Deal strength</option>
          </select>
        </label>
        <input type="hidden" name="order" value={order} />
        <button
          type="submit"
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white md:col-span-3 lg:col-span-4"
        >
          Apply filters
        </button>
      </form>

      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id}>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--accent)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-xs font-medium text-[var(--muted)]">{it.source_name}</p>
                    {hasDeal(it) ? (
                      <span
                        className="inline-flex shrink-0 items-center rounded-md border border-emerald-500/50 bg-emerald-500/20 px-2 py-0.5 text-xs font-bold tracking-tight text-emerald-800 shadow-sm dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-200"
                        title="Deal detected in this email"
                      >
                        Deal Found!
                      </span>
                    ) : null}
                  </div>
                  {it.sender_from || it.email_sent_at ? (
                    <p className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs text-[var(--muted)]">
                      {it.sender_from ? (
                        <span className="min-w-0 truncate font-medium">{it.sender_from}</span>
                      ) : null}
                      {it.email_sent_at ? (
                        <span className="shrink-0">
                          {it.email_sent_at.toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  <Link
                    href={`/feed/${it.id}`}
                    className="mt-1 block font-medium text-[var(--fg)] hover:text-[var(--accent)] hover:underline"
                  >
                    {it.title}
                  </Link>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {selectedId ? (
                    <AddToPostsButton
                      signalItemId={it.id}
                      contentSignalId={selectedId}
                      disabled={!workerIngestConfigured}
                      alreadyInPosts={itemIdsInPosts.has(it.id)}
                    />
                  ) : null}
                  <span className="text-xs text-[var(--muted)]">{it.relevance_score}/10</span>
                </div>
              </div>
              {it.ai_summary ? (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--fg)]">{it.ai_summary}</p>
              ) : (
                <div className="mt-1 max-h-48 overflow-y-auto text-sm break-words text-[var(--muted)]">
                  {it.extracted_text}
                </div>
              )}
              <DealsList deals={dealsForDisplay(it)} variant="feed" />
              {it.key_points?.length ? (
                <KeyPointsList points={it.key_points} variant="compact" />
              ) : null}
              {it.original_url ? <DealLinkRow url={it.original_url} /> : null}
              <p className="mt-2 text-xs text-[var(--muted)]">
                {it.detected_keywords.slice(0, 6).join(", ")}
              </p>
              {it.email_images?.length ? <EmailImageGallery images={it.email_images} /> : null}
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {selectedId ? "No items yet. Sync sources or adjust filters." : "Select a content signal above."}
        </p>
      ) : null}
    </div>
  );
}
