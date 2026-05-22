import type { DealMetrics } from "@content-resourcer/db";
import { dealStrengthPercent, formatDealRow } from "@/lib/deal-display";

export function DealsList({
  deals,
  variant = "detail",
}: {
  deals: DealMetrics[];
  variant?: "detail" | "feed";
}) {
  if (!deals.length) return null;

  const isFeed = variant === "feed";

  return (
    <section className={isFeed ? "mt-3" : "rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"}>
      <h2 className={isFeed ? "text-xs font-medium text-[var(--muted)]" : "text-sm font-medium text-[var(--muted)]"}>
        Deals
      </h2>
      <ul className={isFeed ? "mt-2 space-y-2" : "mt-3 space-y-3"}>
        {deals.map((dm, i) => {
          const pct = dealStrengthPercent(dm);
          return (
            <li
              key={`${dm.you_pay ?? ""}-${dm.baseline_value ?? ""}-${dm.mode}-${i}`}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--input-bg)]/40 px-3 py-2"
            >
              <p className="min-w-0 flex-1 text-sm">{formatDealRow(dm)}</p>
              {pct > 0 ? (
                <span className="inline-flex shrink-0 items-center rounded-md border border-emerald-500/50 bg-emerald-500/20 px-2 py-0.5 text-sm font-bold tabular-nums text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-200">
                  {pct}%
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {isFeed ? null : (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Estimates from email text (regex and, when configured, LLM). Not financial advice; marketing copy can inflate
          &quot;value&quot;.
        </p>
      )}
    </section>
  );
}
