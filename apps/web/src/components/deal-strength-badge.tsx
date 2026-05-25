import type { DealMetrics } from "@content-resourcer/db";
import { dealStrengthPercent } from "@/lib/deal-display";

export function DealStrengthBadge({ dealMetrics }: { dealMetrics: DealMetrics }) {
  const pct = dealStrengthPercent(dealMetrics);
  if (pct <= 0) return null;

  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-0.5 text-sm font-bold tabular-nums text-[var(--success)]">
      {pct}%
    </span>
  );
}
