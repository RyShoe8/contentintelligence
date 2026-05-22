import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDealMetricsFromAmounts,
  dealStrengthPct,
  extractDealMetricsRegex,
} from "./deal-metrics.js";

describe("buildDealMetricsFromAmounts", () => {
  it("computes bonus and savings for same-unit USD ($20 pay, $26 credited)", () => {
    const dm = buildDealMetricsFromAmounts(20, 26, "pay_vs_credited_value", 0.5, "regex", "USD", "USD");
    assert.ok(dm);
    assert.equal(dm.units_comparable, true);
    assert.ok(Math.abs(dm.effective_savings_pct - (1 - 20 / 26)) < 0.01);
    assert.ok(Math.abs(dm.bonus_pct! - (26 - 20) / 20) < 0.01);
    assert.ok(dealStrengthPct(dm) < 0.75);
  });

  it("marks USD pay vs SC credit as incomparable but stores bonus for filters", () => {
    const dm = buildDealMetricsFromAmounts(20, 26, "pay_vs_credited_value", 0.5, "regex", "USD", "SC");
    assert.ok(dm);
    assert.equal(dm.units_comparable, false);
    assert.equal(dm.effective_savings_pct, 0);
    assert.ok(Math.abs(dm.bonus_pct! - 0.3) < 0.02);
    assert.ok(dealStrengthPct(dm) >= 0.25);
  });

  it("retail was $100 now $25 is 75% off", () => {
    const dm = buildDealMetricsFromAmounts(25, 100, "retail_list_vs_sale", 0.55, "regex", "USD", "USD");
    assert.ok(dm);
    assert.ok(Math.abs(dm.effective_savings_pct - 0.75) < 0.01);
    assert.ok(dealStrengthPct(dm) >= 0.75);
  });
});

describe("extractDealMetricsRegex", () => {
  it("deposit $20 get 26 SC has ~30% filterable bonus", () => {
    const dm = extractDealMetricsRegex(
      "Deposit $20 and get 26 SC free",
      "",
      ["SC"],
    );
    assert.ok(dm);
    assert.equal(dm.units_comparable, false);
    assert.ok(dealStrengthPct(dm) >= 0.25);
  });

  it("purchase $20 package receive 26 FREE SC (Thursday Treat copy)", () => {
    const dm = extractDealMetricsRegex(
      "purchase the special $20 package labeled Thursday Treat to receive 26,000 GC, 26 FREE SC",
      "",
      ["SC", "GC"],
    );
    assert.ok(dm);
    assert.equal(dm.you_pay, 20);
    assert.equal(dm.baseline_value, 26);
    assert.ok(dealStrengthPct(dm) >= 0.25);
  });

  it("pay $20 get $26 USD is comparable with ~30% bonus", () => {
    const dm = extractDealMetricsRegex("Pay $20 and get $26 in bonus credits", "", []);
    assert.ok(dm);
    assert.equal(dm.units_comparable, true);
    assert.ok(Math.abs(dm.bonus_pct! - 0.3) < 0.02);
    assert.ok(dealStrengthPct(dm) < 0.75);
  });

  it("was $100 now $25 passes 75% strength", () => {
    const dm = extractDealMetricsRegex("Was $100 now only $25", "", []);
    assert.ok(dm);
    assert.equal(dm.mode, "retail_list_vs_sale");
    assert.ok(dealStrengthPct(dm) >= 0.75);
  });

  it("Mega Bonanza multi-tier: ~30% not 99% from cross-tier pairing", () => {
    const body =
      "Take advantage of the Sizzlin' Stampede with three hot offers on Gold Coins, each claimable three times: 40,000 Gold Coins for $15.49 + 20 Free SC, 64,000 Gold Coins for $24.99 + 32 Free SC, and 90,000 Gold Coins for $34.99 + 45 Free SC. These offers are valid until May 22nd.";
    const dm = extractDealMetricsRegex("Somethin' hot just rode into town", body, ["SC", "GC"]);
    assert.ok(dm);
    const strength = dealStrengthPct(dm);
    assert.ok(strength >= 0.25, `expected >=25% got ${strength}`);
    assert.ok(strength <= 0.4, `expected <=40% got ${strength}`);
    assert.equal(dm.units_comparable, false);
    assert.ok(dm.you_pay != null && dm.baseline_value != null);
    const tierPairs: [number, number][] = [
      [15.49, 20],
      [24.99, 32],
      [34.99, 45],
    ];
    assert.ok(
      tierPairs.some(([pay, sc]) => dm.you_pay === pay && dm.baseline_value === sc),
      `pay/sc should be one tier, got ${dm.you_pay}/${dm.baseline_value}`,
    );
  });
});

describe("dealStrengthPct filter threshold", () => {
  it("excludes $20/$26 USD from 75% min", () => {
    const dm = buildDealMetricsFromAmounts(20, 26, "pay_vs_credited_value", 0.5, "regex", "USD", "USD")!;
    assert.ok(dealStrengthPct(dm) < 0.75);
  });

  it("includes retail 75% off at 75% min", () => {
    const dm = buildDealMetricsFromAmounts(25, 100, "retail_list_vs_sale", 0.55, "regex", "USD", "USD")!;
    assert.ok(dealStrengthPct(dm) >= 0.75);
  });
});
