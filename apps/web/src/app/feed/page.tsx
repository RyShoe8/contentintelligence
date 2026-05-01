import Link from "next/link";
import { ensureIndexes, listSignalItems, listVerticals } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    vertical_id?: string;
    keyword?: string;
    min_score?: string;
    sort?: string;
    order?: string;
  }>;
}) {
  const sp = await searchParams;
  const db = await connectMongo();
  await ensureIndexes(db);
  const verticals = await listVerticals(db);

  const sort = sp.sort === "relevance_score" ? "relevance_score" : "created_at";
  const order = sp.order === "asc" ? "asc" : "desc";
  const min_score = sp.min_score ? Number(sp.min_score) : undefined;

  const items = await listSignalItems(db, {
    vertical_id: sp.vertical_id || undefined,
    keyword: sp.keyword || undefined,
    min_score: Number.isFinite(min_score) ? min_score : undefined,
    sort,
    order,
    limit: 100,
  });

  const toggleQs = new URLSearchParams();
  if (sp.vertical_id) toggleQs.set("vertical_id", sp.vertical_id);
  if (sp.keyword) toggleQs.set("keyword", sp.keyword);
  if (sp.min_score) toggleQs.set("min_score", sp.min_score);
  toggleQs.set("sort", sort);
  toggleQs.set("order", order === "desc" ? "asc" : "desc");
  const toggleOrderHref = `/feed?${toggleQs.toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Signal feed</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Review ingested Gmail signals.</p>
        </div>
        <Link href={toggleOrderHref} className="text-sm text-[var(--accent)]">
          Toggle sort direction ({order === "desc" ? "descending" : "ascending"})
        </Link>
      </div>

      <form className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-4" method="get">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Vertical</span>
          <select
            name="vertical_id"
            defaultValue={sp.vertical_id ?? ""}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          >
            <option value="">All</option>
            {verticals.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Keyword</span>
          <input
            name="keyword"
            defaultValue={sp.keyword ?? ""}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Min score</span>
          <input
            name="min_score"
            type="number"
            step="0.01"
            defaultValue={sp.min_score ?? ""}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Sort by</span>
          <select name="sort" defaultValue={sort} className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2">
            <option value="created_at">Recency</option>
            <option value="relevance_score">Relevance score</option>
          </select>
        </div>
        <input type="hidden" name="order" value={order} />
        <button type="submit" className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white md:col-span-4">
          Apply filters
        </button>
      </form>

      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={`/feed/${it.id}`}
              className="block rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--accent)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{it.title}</p>
                <span className="text-xs text-[var(--muted)]">score {it.relevance_score}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{it.extracted_text}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {it.ai_summary ? "AI summary · " : ""}
                {it.detected_keywords.slice(0, 6).join(", ")}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="text-sm text-[var(--muted)]">No signals yet.</p> : null}
    </div>
  );
}
