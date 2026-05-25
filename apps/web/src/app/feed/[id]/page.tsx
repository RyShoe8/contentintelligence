import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureIndexes, getContentSignal, getSignalItem, isWithinLookback, listPosts } from "@content-resourcer/db";
import { FeedItemCard } from "@/components/feed-item-card";
import { EmailHtmlPreview } from "@/components/email-html-preview";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { PageSection } from "@/components/ui/page-section";
import { connectMongo } from "@/lib/mongo";
import { displayCasinoName } from "@/lib/email-from-display";
import { canAccessOrganization, requireOrgMember, isPlatformAdmin } from "@/lib/org-auth";

export const dynamic = "force-dynamic";

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireOrgMember();
  const db = await connectMongo();
  await ensureIndexes(db);
  const item = await getSignalItem(db, id);
  if (
    !item ||
    (!isPlatformAdmin(session) && !canAccessOrganization(item.organization_id, session))
  ) {
    notFound();
  }

  const contentSignal = await getContentSignal(db, item.content_signal_id);
  if (
    contentSignal &&
    !isWithinLookback(item, contentSignal.lookback_window_hours)
  ) {
    notFound();
  }

  const workerIngestConfigured = !!process.env.WORKER_URL;
  const draftPosts = await listPosts(db, {
    organizationId: item.organization_id,
    content_signal_id: item.content_signal_id,
    status: "draft",
    limit: 500,
  });
  const alreadyInPosts = draftPosts.some((p) => p.signal_item_id === item.id);

  const casino = displayCasinoName(item);
  const metaParts = [
    casino ? null : item.source_name,
    `Relevance ${item.relevance_score}/10`,
    `Ingested ${item.created_at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <Link href="/feed" className="text-sm font-medium text-[var(--primary)] hover:underline">
        ← Back to feed
      </Link>

      <PageHeader
        title={casino ?? item.title}
        description={
          casino
            ? [item.title, ...metaParts].join(" · ")
            : metaParts.join(" · ")
        }
      />

      {item.skip_reason ? (
        <Alert variant="warning">Pre-filter: {item.skip_reason}</Alert>
      ) : null}

      <FeedItemCard
        item={item}
        variant="detail"
        contentSignalId={item.content_signal_id}
        workerIngestConfigured={workerIngestConfigured}
        alreadyInPosts={alreadyInPosts}
        showKeywords
      />

      {item.email_html_preview ? (
        <PageSection
          title="Email body"
          description="Sanitized preview of the message HTML (remote images may be blocked here; see attachments above)."
        >
          <div className="max-h-[32rem] overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
            <EmailHtmlPreview html={item.email_html_preview} />
          </div>
        </PageSection>
      ) : null}

      {item.email_html_preview ? (
        <PageSection title="Extracted text">
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-sm">
            {item.extracted_text}
          </pre>
        </PageSection>
      ) : null}

      {!item.key_points?.length && !item.skip_reason ? (
        <p className="text-sm text-[var(--muted)]">
          No key points in the summary above. Sync the feed to refresh this item.
        </p>
      ) : null}

      <PageSection title="Raw email content">
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--muted)]">
          {item.raw_content}
        </pre>
      </PageSection>
    </div>
  );
}
