import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DealMetrics } from "./schemas.js";
import { buildDealKey, dealStrengthPct, dealStrengthPercent, dealsForPostEval } from "./deal-strength.js";

const scDeal: DealMetrics = {
  you_pay: 20,
  baseline_value: 26,
  pay_unit: "USD",
  credit_unit: "SC",
  units_comparable: false,
  effective_savings_pct: 0,
  bonus_pct: 0.3,
  value_ratio: undefined,
  mode: "pay_vs_credited_value",
  confidence: 0.5,
  source: "regex",
};

describe("dealStrengthPct", () => {
  it("uses bonus when savings is zero for mixed units", () => {
    assert.equal(dealStrengthPct(scDeal), 0.3);
    assert.equal(dealStrengthPercent(scDeal), 30);
  });
});

describe("buildDealKey", () => {
  it("is stable for a tier", () => {
    assert.equal(buildDealKey(scDeal), "20-26-sc-pay_vs_credited_value");
  });
});

describe("dealsForPostEval", () => {
  it("prefers deals_found", () => {
    const other: DealMetrics = { ...scDeal, you_pay: 50, baseline_value: 75 };
    const deals = dealsForPostEval({ deals_found: [scDeal, other] });
    assert.equal(deals.length, 2);
  });
});
