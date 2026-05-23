import type { DealMetrics } from "@content-resourcer/db";
import { dealStrengthPct, dealStrengthPercent } from "@content-resourcer/db";

type DealItemLike = {
  deal_metrics?: DealMetrics | null;
  deals_found?: DealMetrics[] | null;
};

function confidenceLabel(c: number): string {
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

export { dealStrengthPct, dealStrengthPercent };

export function hasDeal(item: DealItemLike): boolean {
  if (item.deals_found?.length) {
    return item.deals_found.some((d) => dealStrengthPct(d) > 0);
  }
  return item.deal_metrics != null && dealStrengthPct(item.deal_metrics) > 0;
}

/** All deals for detail UI (backward compat when only deal_metrics exists). */
export function dealsForDisplay(item: DealItemLike): DealMetrics[] {
  const list = item.deals_found?.length
    ? item.deals_found
    : item.deal_metrics
      ? [item.deal_metrics]
      : [];
  return list.filter((d) => dealStrengthPct(d) > 0);
}

function formatMoneyAmount(amount: number, unit?: string): string {
  if (unit === "USD") return `$${amount}`;
  return `${amount}${unit ? ` ${unit}` : ""}`;
}

/** One human-readable deal line for the Deals section. */
export function formatDealRow(dm: DealMetrics): string {
  const pay =
    dm.you_pay != null
      ? formatMoneyAmount(dm.you_pay, dm.pay_unit ?? (dm.units_comparable !== false ? "USD" : undefined))
      : null;
  const credit =
    dm.baseline_value != null
      ? formatMoneyAmount(
          dm.baseline_value,
          dm.credit_unit ?? (dm.units_comparable !== false ? "USD" : undefined),
        )
      : null;
  const amounts = pay && credit ? `${pay} → ${credit}` : pay ?? credit ?? "Deal";

  if (dm.units_comparable === false) {
    const bonusPct = dm.bonus_pct != null ? Math.round(dm.bonus_pct * 100) : null;
    return bonusPct != null ? `${amounts} · ~${bonusPct}% bonus` : amounts;
  }

  const savingsPct = Math.round(dm.effective_savings_pct * 100);
  if (dm.mode === "retail_list_vs_sale") {
    return `${amounts} · ~${savingsPct}% off list`;
  }

  const bonusPct = dm.bonus_pct != null ? Math.round(dm.bonus_pct * 100) : null;
  if (bonusPct != null && bonusPct !== savingsPct) {
    return `${amounts} · ~${bonusPct}% bonus`;
  }
  return `${amounts} · ~${savingsPct}% value vs pay`;
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
    const bonusPct = dm.bonus_pct != null ? Math.round(dm.bonus_pct * 100) : null;
    const bonusHint = bonusPct != null ? `~${bonusPct}% bonus on spend` : "mixed units";
    return `Deal detected (${amounts} · ${bonusHint}) · ${confidenceLabel(dm.confidence)} confidence`;
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
