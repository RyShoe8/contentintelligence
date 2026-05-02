import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureIndexes, getSignalItem } from "@content-resourcer/db";
import { EmailImageGallery } from "@/components/email-image-gallery";
import { connectMongo } from "@/lib/mongo";
import { formatDealDetail } from "@/lib/deal-display";

export const dynamic = "force-dynamic";

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await connectMongo();
  await ensureIndexes(db);
  const item = await getSignalItem(db, id);
  if (!item) notFound();

  return (
    <div className="space-y-6">
      <Link href="/feed" className="text-sm text-[var(--accent)]">
        ← Back to feed
      </Link>
      <div>
        {item.sender_from ? (
          <p className="text-sm text-[var(--muted)]">
            <span className="font-medium text-[var(--fg)]">From</span> {item.sender_from}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Relevance {item.relevance_score}/10 · {item.source_name} · {item.created_at.toISOString()}
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
