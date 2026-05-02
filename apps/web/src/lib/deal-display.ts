import type { DealMetrics } from "@content-resourcer/db";

function confidenceLabel(c: number): string {
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

/** Short line for list cards. */
export function formatDealBadge(dm: DealMetrics): string {
  const pct = Math.round(dm.effective_savings_pct * 100);
  const modeHint =
    dm.mode === "pay_vs_credited_value"
      ? "value vs pay"
      : dm.mode === "retail_list_vs_sale"
        ? "% off list"
        : "deal";
  const ratio = dm.value_ratio != null ? ` · ${dm.value_ratio.toFixed(1)}×` : "";
  return `~${pct}% ${modeHint}${ratio} · ${confidenceLabel(dm.confidence)} confidence`;
}

export function formatDealDetail(dm: DealMetrics): string {
  const parts = [
    `Effective savings ~${Math.round(dm.effective_savings_pct * 100)}%`,
    dm.you_pay != null && dm.baseline_value != null
      ? `Pay $${dm.you_pay} vs baseline $${dm.baseline_value}`
      : null,
    `Mode: ${dm.mode}`,
    `Source: ${dm.source}`,
    `Confidence: ${confidenceLabel(dm.confidence)} (${dm.confidence.toFixed(2)})`,
  ].filter(Boolean);
  return parts.join(" · ");
}
