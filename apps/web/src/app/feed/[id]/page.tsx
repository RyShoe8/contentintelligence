import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureIndexes, getContentSignal, getSignalItem, isWithinLookback, listPosts } from "@content-resourcer/db";
import { AddToPostsButton } from "@/components/add-to-posts-button";
import { EmailHtmlPreview } from "@/components/email-html-preview";
import { EmailImageGallery } from "@/components/email-image-gallery";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { PageSection } from "@/components/ui/page-section";
import { connectMongo } from "@/lib/mongo";
import { DealsList } from "@/components/deals-list";
import { DealLinkRow } from "@/components/deal-link-row";
import { KeyPointsList } from "@/components/key-points-list";
import { dealsForDisplay } from "@/lib/deal-display";
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

  const metaParts = [
    `Relevance ${item.relevance_score}/10`,
    item.source_name,
    `Ingested ${item.created_at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
  ];

  return (
    <div className="space-y-6">
      <Link href="/feed" className="text-sm font-medium text-[var(--primary)] hover:underline">
        ← Back to feed
      </Link>

      <PageHeader
        title={item.title}
        description={metaParts.join(" · ")}
        actions={
          <AddToPostsButton
            signalItemId={item.id}
            contentSignalId={item.content_signal_id}
            disabled={!workerIngestConfigured}
            alreadyInPosts={alreadyInPosts}
          />
        }
      />

      {item.sender_from || item.email_sent_at ? (
        <p className="-mt-4 flex flex-wrap items-baseline gap-x-2 text-sm text-[var(--muted)]">
          {item.sender_from ? (
            <>
              <span className="font-medium text-[var(--fg)]">From</span> {item.sender_from}
            </>
          ) : null}
          {item.sender_from && item.email_sent_at ? <span aria-hidden>·</span> : null}
          {item.email_sent_at ? (
            <>
              <span className="font-medium text-[var(--fg)]">Sent</span>{" "}
              {item.email_sent_at.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </>
          ) : null}
        </p>
      ) : null}

      {item.skip_reason ? (
        <Alert variant="warning">Pre-filter: {item.skip_reason}</Alert>
      ) : null}

      {item.ai_summary ? (
        <PageSection title="AI summary">
          <p className="whitespace-pre-wrap text-sm">{item.ai_summary}</p>
        </PageSection>
      ) : null}

      {item.email_html_preview ? (
        <PageSection
          title="Email body"
          description="Sanitized preview of the message HTML (remote images may be blocked here; see image gallery below)."
        >
          <div className="max-h-[32rem] overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
            <EmailHtmlPreview html={item.email_html_preview} />
          </div>
        </PageSection>
      ) : (
        <PageSection title="Email body">
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-sm">
            {item.extracted_text}
          </pre>
        </PageSection>
      )}

      {item.key_points?.length ? (
        <PageSection title="Key Points">
          <KeyPointsList points={item.key_points} />
        </PageSection>
      ) : !item.skip_reason ? (
        <PageSection title="Key Points">
          <p className="text-sm text-[var(--muted)]">
            No key points extracted yet. Sync the feed to refresh this item.
          </p>
        </PageSection>
      ) : null}

      <PageSection title="Deals">
        <DealsList deals={dealsForDisplay(item)} />
      </PageSection>

      {item.original_url ? (
        <PageSection title="Deal link">
          <DealLinkRow url={item.original_url} />
        </PageSection>
      ) : null}

      {item.email_images?.length ? (
        <PageSection title="Images from email">
          <EmailImageGallery images={item.email_images} />
        </PageSection>
      ) : null}

      <PageSection title="Detected keywords">
        <p className="text-sm">{item.detected_keywords.join(", ") || "—"}</p>
      </PageSection>

      {item.email_html_preview ? (
        <PageSection title="Extracted text">
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-sm">
            {item.extracted_text}
          </pre>
        </PageSection>
      ) : null}

      <PageSection title="Raw email content">
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--muted)]">
          {item.raw_content}
        </pre>
      </PageSection>
    </div>
  );
}
