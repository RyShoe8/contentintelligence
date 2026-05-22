import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureIndexes, getSignalItem } from "@content-resourcer/db";
import { EmailHtmlPreview } from "@/components/email-html-preview";
import { EmailImageGallery } from "@/components/email-image-gallery";
import { connectMongo } from "@/lib/mongo";
import { formatDealDetail } from "@/lib/deal-display";
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
      </div>

      {item.ai_summary ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">AI summary</h2>
          <p className="mt-2 whitespace-pre-wrap">{item.ai_summary}</p>
        </section>
      ) : null}

      {item.deal_metrics ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Deal metrics</h2>
          <p className="mt-2 text-sm">{formatDealDetail(item.deal_metrics)}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Estimates from email text (regex and, when configured, LLM). Not financial advice; marketing copy can inflate
            &quot;value&quot;.
          </p>
        </section>
      ) : null}

      {item.email_images?.length ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Images from email</h2>
          <EmailImageGallery images={item.email_images} />
        </section>
      ) : null}

      {item.email_html_preview ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium text-[var(--muted)]">Formatted (HTML)</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Sanitized preview of the message HTML (remote images may be blocked here; see downloads above when present).
          </p>
          <div className="mt-3 max-h-[32rem] overflow-auto rounded border border-[var(--border)] bg-[var(--input-bg)] p-3">
            <EmailHtmlPreview html={item.email_html_preview} />
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">Detected keywords</h2>
        <p className="mt-2">{item.detected_keywords.join(", ") || "—"}</p>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">Extracted text</h2>
        <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-sm">
          {item.extracted_text}
        </pre>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-medium text-[var(--muted)]">Raw email content</h2>
        <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--muted)]">
          {item.raw_content}
        </pre>
      </section>
    </div>
  );
}
