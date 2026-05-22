import type { DealMetrics } from "@content-resourcer/db";

function confidenceLabel(c: number): string {
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

function dealStrengthPct(dm: DealMetrics): number {
  if (dm.units_comparable === false) return 0;
  return Math.max(dm.effective_savings_pct ?? 0, dm.bonus_pct ?? 0);
}

/** Short line for list cards. */
export function formatDealBadge(dm: DealMetrics): string {
  if (dm.units_comparable === false) {
    const pay = dm.you_pay != null ? `${dm.pay_unit === "USD" ? "$" : ""}${dm.you_pay}${dm.pay_unit && dm.pay_unit !== "USD" ? ` ${dm.pay_unit}` : ""}` : "";
    const credit =
      dm.baseline_value != null
        ? `${dm.credit_unit === "USD" ? "$" : ""}${dm.baseline_value}${dm.credit_unit ? ` ${dm.credit_unit}` : ""}`
        : "";
    const amounts = pay && credit ? `${pay} → ${credit}` : "mixed units";
    return `Deal detected (${amounts} — not filterable) · ${confidenceLabel(dm.confidence)} confidence`;
  }

  const strength = Math.round(dealStrengthPct(dm) * 100);
  const bonusPct = dm.bonus_pct != null ? Math.round(dm.bonus_pct * 100) : null;
  const savingsPct = Math.round(dm.effective_savings_pct * 100);

  if (dm.mode === "retail_list_vs_sale") {
    const ratio = dm.value_ratio != null ? ` · ${dm.value_ratio.toFixed(1)}×` : "";
    return `~${savingsPct}% off list${ratio} · ${confidenceLabel(dm.confidence)} confidence`;
  }

  if (dm.mode === "pay_vs_credited_value" && bonusPct != null && bonusPct !== savingsPct) {
    const ratio = dm.value_ratio != null ? ` · ${dm.value_ratio.toFixed(1)}×` : "";
    return `~${bonusPct}% bonus · ~${savingsPct}% value vs pay${ratio} · ${confidenceLabel(dm.confidence)} confidence`;
  }

  const modeHint = dm.mode === "unknown" ? "deal" : "value vs pay";
  const ratio = dm.value_ratio != null ? ` · ${dm.value_ratio.toFixed(1)}×` : "";
  return `~${strength}% ${modeHint}${ratio} · ${confidenceLabel(dm.confidence)} confidence`;
}

export function formatDealDetail(dm: DealMetrics): string {
  if (dm.units_comparable === false) {
    const parts = [
      "Mixed units — not used for min-deal filters",
      dm.you_pay != null && dm.pay_unit
        ? `Pay ${dm.you_pay} ${dm.pay_unit}`
        : dm.you_pay != null
          ? `Pay ${dm.you_pay}`
          : null,
      dm.baseline_value != null && dm.credit_unit
        ? `Credited ${dm.baseline_value} ${dm.credit_unit}`
        : dm.baseline_value != null
          ? `Credited ${dm.baseline_value}`
          : null,
      `Mode: ${dm.mode}`,
      `Source: ${dm.source}`,
      `Confidence: ${confidenceLabel(dm.confidence)} (${dm.confidence.toFixed(2)})`,
    ].filter(Boolean);
    return parts.join(" · ");
  }

  const strength = Math.round(dealStrengthPct(dm) * 100);
  const bonusLine =
    dm.bonus_pct != null ? `Bonus on spend ~${Math.round(dm.bonus_pct * 100)}%` : null;
  const parts = [
    `Deal strength ~${strength}% (passes filter if ≥ your min)`,
    bonusLine,
    `Effective savings ~${Math.round(dm.effective_savings_pct * 100)}%`,
    dm.you_pay != null && dm.baseline_value != null
      ? `Pay ${dm.pay_unit === "USD" ? "$" : ""}${dm.you_pay}${dm.pay_unit && dm.pay_unit !== "USD" ? ` ${dm.pay_unit}` : ""} vs baseline ${dm.credit_unit === "USD" ? "$" : ""}${dm.baseline_value}${dm.credit_unit && dm.credit_unit !== "USD" ? ` ${dm.credit_unit}` : ""}`
      : null,
    `Mode: ${dm.mode}`,
    `Source: ${dm.source}`,
    `Confidence: ${confidenceLabel(dm.confidence)} (${dm.confidence.toFixed(2)})`,
  ].filter(Boolean);
  return parts.join(" · ");
}
