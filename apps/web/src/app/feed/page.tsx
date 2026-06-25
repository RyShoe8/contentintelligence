import Link from "next/link";
import { FeedPageClient } from "@/components/feed-page-client";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { parseFeedOrder, parseFeedSort } from "@/lib/feed-data";
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
  await requireOrgMember();
  const workerIngestConfigured = !!process.env.WORKER_URL;
  const clearedCount = sp.cleared ? Number(sp.cleared) : null;

  const sort = parseFeedSort(sp);
  const order = parseFeedOrder(sp, sort);

  const filterQs = new URLSearchParams();
  if (sp.content_signal_id || sp.vertical_id) {
    filterQs.set("content_signal_id", sp.content_signal_id || sp.vertical_id || "");
  }
  if (sp.keyword) filterQs.set("keyword", sp.keyword);
  if (sp.min_score) filterQs.set("min_score", sp.min_score);
  if (sp.min_deal_pct) filterQs.set("min_deal_pct", sp.min_deal_pct);
  if (sp.min_deal_confidence) filterQs.set("min_deal_confidence", sp.min_deal_confidence);
  if (sp.has_deal === "1") filterQs.set("has_deal", "1");
  if (sp.full_body === "1") filterQs.set("full_body", "1");
  filterQs.set("sort", sort);
  filterQs.set("order", order);
  const toggleOrderHref = `/feed?${new URLSearchParams({
    ...Object.fromEntries(filterQs),
    order: order === "desc" ? "asc" : "desc",
  }).toString()}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Signal Feed"
        description="Browse and filter content items pulled from your topic sources. Select a topic, sync, and explore results."
        actions={
          sort !== "created_at" ? (
            <Link
              href={toggleOrderHref}
              className="text-sm font-medium text-[var(--primary)] hover:underline"
            >
              Toggle sort ({order === "desc" ? "desc" : "asc"})
            </Link>
          ) : (
            <span className="text-sm text-[var(--muted)]">Newest first</span>
          )
        }
      />

      {clearedCount !== null && Number.isFinite(clearedCount) ? (
        <Alert variant="success">
          Cleared {clearedCount} feed {clearedCount === 1 ? "item" : "items"}. Run Sync now to
          re-ingest.
        </Alert>
      ) : null}
      {sp.error === "not_found" ? <Alert variant="error">Content signal not found.</Alert> : null}

      <FeedPageClient
        searchParams={sp}
        workerIngestConfigured={workerIngestConfigured}
        sort={sort}
        order={order}
      />
    </div>
  );
}
