import type { DealMetrics } from "@content-resourcer/db";
import { dealStrengthPercent } from "@/lib/deal-display";

export function DealStrengthBadge({ dealMetrics }: { dealMetrics: DealMetrics }) {
  const pct = dealStrengthPercent(dealMetrics);
  if (pct <= 0) return null;

  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-emerald-500/50 bg-emerald-500/20 px-2 py-0.5 text-sm font-bold tabular-nums text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-200">
      {pct}%
    </span>
  );
}
