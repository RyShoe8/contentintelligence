import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureIndexes, getContentSignal, getSignalItem, isWithinLookback, listPosts } from "@content-resourcer/db";
import { AddToPostsButton } from "@/components/add-to-posts-button";
import { EmailHtmlPreview } from "@/components/email-html-preview";
import { EmailImageGallery } from "@/components/email-image-gallery";
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

  return (
    <div className="space-y-6">
      <Link href="/feed" className="text-sm text-[var(--accent)]">
        ← Back to feed
      </Link>
      <div>
        {item.sender_from || item.email_sent_at ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-[var(--muted)]">
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
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Relevance {item.relevance_score}/10 · {item.source_name} · Ingested{" "}
          {item.created_at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
        {item.skip_reason ? (
          <p className="mt-2 text-sm text-amber-400">Pre-filter: {item.skip_reason}</p>
        ) : null}
        <div className="mt-3">
          <AddToPostsButton
            signalItemId={item.id}
            contentSignalId={item.content_signal_id}
            disabled={!workerIngestConfigured}
            alreadyInPosts={alreadyInPosts}
          />
        </div>
      </div>

      {item.ai_summary ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">AI summary</h2>
          <p className="mt-2 whitespace-pre-wrap">{item.ai_summary}</p>
        </section>
      ) : null}

      {item.email_html_preview ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Email body</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Sanitized preview of the message HTML (remote images may be blocked here; see image gallery below).
          </p>
          <div className="mt-3 max-h-[32rem] overflow-auto rounded border border-[var(--border)] bg-[var(--input-bg)] p-3">
            <EmailHtmlPreview html={item.email_html_preview} />
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Email body</h2>
          <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-sm">
            {item.extracted_text}
          </pre>
        </section>
      )}

      {item.key_points?.length ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Key Points</h2>
          <KeyPointsList points={item.key_points} />
        </section>
      ) : !item.skip_reason ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Key Points</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            No key points extracted yet. Sync the feed to refresh this item.
          </p>
        </section>
      ) : null}

      <DealsList deals={dealsForDisplay(item)} />

      {item.original_url ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Deal link</h2>
          <DealLinkRow url={item.original_url} />
        </section>
      ) : null}

      {item.email_images?.length ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Images from email</h2>
          <EmailImageGallery images={item.email_images} />
        </section>
      ) : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">Detected keywords</h2>
        <p className="mt-2">{item.detected_keywords.join(", ") || "—"}</p>
      </section>

      {item.email_html_preview ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Extracted text</h2>
          <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-sm">
            {item.extracted_text}
          </pre>
        </section>
      ) : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">Raw email content</h2>
        <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--muted)]">
          {item.raw_content}
        </pre>
      </section>
    </div>
  );
}
