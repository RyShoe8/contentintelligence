import Link from "next/link";
import type { SignalItem } from "@content-resourcer/db";
import { AddToPostsButton } from "@/components/add-to-posts-button";
import { DealsList } from "@/components/deals-list";
import { DealLinkRow } from "@/components/deal-link-row";
import { EmailImageGallery } from "@/components/email-image-gallery";
import { FeedItemSection } from "@/components/feed-item-section";
import { KeyPointsList } from "@/components/key-points-list";
import { Card, CardContent } from "@/components/ui/card";
import { displayCasinoName, displaySenderEmail } from "@/lib/email-from-display";
import { cleanEmailPreview } from "@/lib/email-preview";
import { dealsForDisplay, hasDeal } from "@/lib/deal-display";
import { isNonDealUrl } from "@/lib/deal-url";

type Props = {
  item: SignalItem;
  variant?: "feed" | "detail";
  contentSignalId?: string;
  workerIngestConfigured?: boolean;
  alreadyInPosts?: boolean;
  showKeywords?: boolean;
};

export function FeedItemCard({
  item,
  variant = "feed",
  contentSignalId,
  workerIngestConfigured = false,
  alreadyInPosts = false,
  showKeywords = variant === "feed",
}: Props) {
  const casino = displayCasinoName(item);
  const senderEmail = displaySenderEmail(item.sender_from);
  const deals = dealsForDisplay(item);
  const previewText = item.ai_summary
    ? cleanEmailPreview(item.ai_summary)
    : cleanEmailPreview(item.extracted_text);
  const showDealLink = item.original_url && !isNonDealUrl(item.original_url);
  const isFeed = variant === "feed";

  return (
    <Card className={isFeed ? "transition-colors hover:border-[var(--primary)]" : undefined}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {casino ? (
                <h2 className="text-lg font-semibold tracking-tight text-[var(--fg)]">{casino}</h2>
              ) : null}
              <span className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--muted)]">
                {item.source_name}
              </span>
              {hasDeal(item) ? (
                <span className="inline-flex shrink-0 items-center rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-0.5 text-xs font-bold text-[var(--success)]">
                  Deal Found!
                </span>
              ) : null}
            </div>
            {senderEmail || item.email_sent_at ? (
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--muted)]">
                {senderEmail ? <span>{senderEmail}</span> : null}
                {senderEmail && item.email_sent_at ? <span aria-hidden>·</span> : null}
                {item.email_sent_at ? (
                  <span>
                    {item.email_sent_at.toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {contentSignalId ? (
              <AddToPostsButton
                signalItemId={item.id}
                contentSignalId={contentSignalId}
                disabled={!workerIngestConfigured}
                alreadyInPosts={alreadyInPosts}
              />
            ) : null}
            <span className="text-xs font-medium tabular-nums text-[var(--muted)]">
              {item.relevance_score}/10
            </span>
          </div>
        </div>

        {isFeed ? (
          <Link
            href={`/feed/${item.id}`}
            className="mt-2 block text-base font-medium text-[var(--fg)] hover:text-[var(--primary)] hover:underline"
          >
            {item.title}
          </Link>
        ) : (
          <h3 className="mt-2 text-base font-medium text-[var(--fg)]">{item.title}</h3>
        )}

        <FeedItemSection title="Preview" showDivider={false}>
          <div
            className={`rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--fg)] ${
              isFeed ? "line-clamp-3" : "max-h-48 overflow-y-auto"
            }`}
          >
            {previewText || "—"}
          </div>
        </FeedItemSection>

        {deals.length > 0 ? (
          <FeedItemSection title="Deals">
            <DealsList deals={deals} variant="feed" />
          </FeedItemSection>
        ) : null}

        {item.key_points?.length ? (
          <FeedItemSection title="Key Points">
            <KeyPointsList points={item.key_points} variant="compact" />
          </FeedItemSection>
        ) : null}

        {showDealLink ? (
          <FeedItemSection title="Deal link">
            <DealLinkRow url={item.original_url!} variant="panel" />
          </FeedItemSection>
        ) : null}

        {item.email_images?.length ? (
          <FeedItemSection title={`Attachments (${item.email_images.length})`}>
            <EmailImageGallery images={item.email_images} variant={isFeed ? "feed" : "detail"} />
          </FeedItemSection>
        ) : null}

        {showKeywords && item.detected_keywords.length > 0 ? (
          <FeedItemSection title="Keywords">
            <p className="text-xs text-[var(--muted)]">{item.detected_keywords.slice(0, 6).join(", ")}</p>
          </FeedItemSection>
        ) : null}
      </CardContent>
    </Card>
  );
}
