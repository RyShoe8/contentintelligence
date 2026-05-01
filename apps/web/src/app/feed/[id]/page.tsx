import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureIndexes, getSignalItem } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";

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
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Score {item.relevance_score} · {item.source_name} · {item.created_at.toISOString()}
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
