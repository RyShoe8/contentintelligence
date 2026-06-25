import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DealMetrics } from "@content-resourcer/db";
import { dealsForDisplay, formatDealRow, hasDeal } from "./deal-display.js";

const scDeal: DealMetrics = {
  you_pay: 34.99,
  baseline_value: 45,
  effective_savings_pct: 0,
  bonus_pct: 0.286,
  value_ratio: undefined,
  mode: "pay_vs_credited_value",
  confidence: 0.55,
  source: "regex",
  units_comparable: false,
  pay_unit: "USD",
  credit_unit: "SC",
};

describe("hasDeal", () => {
  it("true when deals_found has strength", () => {
    assert.equal(hasDeal({ deals_found: [scDeal] }), true);
  });

  it("true when only deal_metrics present", () => {
    assert.equal(hasDeal({ deal_metrics: scDeal }), true);
  });

  it("false when no deals", () => {
    assert.equal(hasDeal({}), false);
  });
});

describe("dealsForDisplay", () => {
  it("prefers deals_found over single deal_metrics", () => {
    const other: DealMetrics = { ...scDeal, you_pay: 15.49, baseline_value: 20 };
    assert.equal(dealsForDisplay({ deals_found: [scDeal, other], deal_metrics: scDeal }).length, 2);
  });

  it("falls back to deal_metrics", () => {
    assert.equal(dealsForDisplay({ deal_metrics: scDeal }).length, 1);
  });
});

describe("formatDealRow", () => {
  it("includes pay, credit, and bonus percent for SC deals", () => {
    const row = formatDealRow(scDeal);
    assert.match(row, /\$34\.99/);
    assert.match(row, /45 SC/);
    assert.match(row, /~29% bonus/);
  });
});
