import Link from "next/link";
import { ensureIndexes, listSignalItems, listVerticals } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { formatDealBadge } from "@/lib/deal-display";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    vertical_id?: string;
    keyword?: string;
    min_score?: string;
    min_deal_pct?: string;
    min_deal_confidence?: string;
    has_deal?: string;
    sort?: string;
    order?: string;
  }>;
}) {
  const sp = await searchParams;
  const db = await connectMongo();
  await ensureIndexes(db);
  const verticals = await listVerticals(db);

  const sort =
    sp.sort === "relevance_score"
      ? "relevance_score"
      : sp.sort === "deal_savings"
        ? "deal_savings"
        : "created_at";
  const order = sp.order === "asc" ? "asc" : "desc";
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

  const items = await listSignalItems(db, {
    vertical_id: sp.vertical_id || undefined,
    keyword: sp.keyword || undefined,
    min_score: Number.isFinite(min_score) ? min_score : undefined,
    min_effective_savings_pct,
    min_confidence,
    has_deal_metrics: has_deal_metrics || undefined,
    sort,
    order,
    limit: 100,
  });

  const toggleQs = new URLSearchParams();
  if (sp.vertical_id) toggleQs.set("vertical_id", sp.vertical_id);
  if (sp.keyword) toggleQs.set("keyword", sp.keyword);
  if (sp.min_score) toggleQs.set("min_score", sp.min_score);
  if (sp.min_deal_pct) toggleQs.set("min_deal_pct", sp.min_deal_pct);
  if (sp.min_deal_confidence) toggleQs.set("min_deal_confidence", sp.min_deal_confidence);
  if (sp.has_deal === "1") toggleQs.set("has_deal", "1");
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

      <form className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-3 lg:grid-cols-4" method="get">
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Min deal (% off)</span>
          <input
            name="min_deal_pct"
            type="number"
            min={0}
            max={100}
            step={1}
            placeholder="e.g. 50"
            defaultValue={sp.min_deal_pct ?? ""}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          />
          <span className="text-xs text-[var(--muted)]">
            Uses parsed pay vs baseline (retail list vs sale, or credited value vs cash). Leave empty to ignore.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Min deal confidence (0–1)</span>
          <input
            name="min_deal_confidence"
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="optional"
            defaultValue={sp.min_deal_confidence ?? ""}
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          />
        </label>
        <div className="flex flex-col gap-2 text-sm md:col-span-2 lg:col-span-1">
          <span className="text-[var(--muted)]">Deal data</span>
          <span className="flex items-center gap-2">
            <input type="checkbox" name="has_deal" value="1" defaultChecked={sp.has_deal === "1"} id="has_deal" />
            <label htmlFor="has_deal" className="text-[var(--fg)]">
              Only rows with parsed deal metrics
            </label>
          </span>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Sort by</span>
          <select name="sort" defaultValue={sort} className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2">
            <option value="created_at">Recency</option>
            <option value="relevance_score">Relevance score</option>
            <option value="deal_savings">Deal strength</option>
          </select>
        </div>
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
            <Link
              href={`/feed/${it.id}`}
              className="block rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--accent)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {it.sender_from ? (
                    <p className="truncate text-xs text-[var(--muted)]" title={it.sender_from}>
                      {it.sender_from}
                    </p>
                  ) : null}
                  <p className="font-medium">{it.title}</p>
                </div>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {it.relevance_score}/10
                </span>
              </div>
              {it.deal_metrics ? (
                <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">{formatDealBadge(it.deal_metrics)}</p>
              ) : null}
              {it.ai_summary ? (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--fg)]">{it.ai_summary}</p>
              ) : null}
              {it.ai_summary ? (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{it.extracted_text}</p>
              ) : (
                <div className="mt-1 max-h-48 overflow-y-auto text-sm break-words text-[var(--muted)]">
                  {it.extracted_text}
                </div>
              )}
              <p className="mt-2 text-xs text-[var(--muted)]">
                {it.ai_summary ? "AI summary · " : "Body · "}
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
