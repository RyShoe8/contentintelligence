import type { DealMetrics } from "@content-resourcer/db/schemas";
import { formatDealRow } from "@/lib/deal-display";
import { DealStrengthBadge } from "@/components/deal-strength-badge";

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
    <section className={isFeed ? "mt-3" : "ui-card p-4"}>
      <h2 className={isFeed ? "text-xs font-medium text-[var(--muted)]" : "text-sm font-medium text-[var(--muted)]"}>
        Deals
      </h2>
      <ul className={isFeed ? "mt-2 space-y-2" : "mt-3 space-y-3"}>
        {deals.map((dm, i) => {
          return (
            <li
              key={`${dm.you_pay ?? ""}-${dm.baseline_value ?? ""}-${dm.mode}-${i}`}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--input-bg)]/40 px-3 py-2"
            >
              <p className="min-w-0 flex-1 text-sm">{formatDealRow(dm)}</p>
              <DealStrengthBadge dealMetrics={dm} />
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
