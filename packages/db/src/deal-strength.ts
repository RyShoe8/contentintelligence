import type { DealMetrics } from "./schemas.js";

/** Filterable deal strength 0–1 (matches feed min-deal filter). */
export function dealStrengthPct(dm: DealMetrics): number {
  const savings = dm.units_comparable === false ? 0 : (dm.effective_savings_pct ?? 0);
  const bonus = dm.bonus_pct ?? 0;
  return Math.max(savings, bonus);
}

export function dealStrengthPercent(dm: DealMetrics): number {
  return Math.round(dealStrengthPct(dm) * 100);
}

/** Stable key for one deal tier within a signal item. */
export function buildDealKey(dm: DealMetrics): string {
  const pay = dm.you_pay ?? "";
  const baseline = dm.baseline_value ?? "";
  const credit = (dm.credit_unit ?? "").toLowerCase();
  return `${pay}-${baseline}-${credit}-${dm.mode}`;
}

export type DealItemLike = {
  deal_metrics?: DealMetrics | null;
  deals_found?: DealMetrics[] | null;
};

/** All deals for post evaluation (prefers deals_found). */
export function dealsForPostEval(item: DealItemLike): DealMetrics[] {
  const list = item.deals_found?.length
    ? item.deals_found
    : item.deal_metrics
      ? [item.deal_metrics]
      : [];
  return list.filter((d) => dealStrengthPct(d) > 0);
}
