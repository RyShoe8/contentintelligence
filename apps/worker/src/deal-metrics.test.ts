import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDealMetricsFromAmounts,
  countDistinctOffers,
  dealStrengthPct,
  extractDealMetricsRegex,
  extractDealsFoundRegex,
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

describe("countDistinctOffers", () => {
  it("does not treat duplicate FREE SC in subject and body as multi-offer", () => {
    const subject = "Claim 75 FREE SC!";
    const body = "$50 = 75,000 GC + 75 FREE SC. purchase the special $50 package.";
    assert.ok(countDistinctOffers(`${subject}\n${body}`) < 2);
  });
});

describe("extractDealMetricsRegex", () => {
  it("Spinfinite Thursday Treat: $20 = 26 FREE SC", () => {
    const subject = "Mega Offer Ends Soon — 26 FREE SC";
    const body =
      "For a limited time, grab this boosted package: $20 = 26,000 GC + 26 FREE SC + Cosmic Wheel Spin. purchase via our special $20 package labelled Thursday Treat.";
    const dm = extractDealMetricsRegex(subject, body, ["SC", "GC"]);
    assert.ok(dm, "expected deal");
    assert.equal(dm.you_pay, 20);
    assert.equal(dm.baseline_value, 26);
    assert.ok(dealStrengthPct(dm) >= 0.25);
  });

  it("Spinfinite: $50 = 75 FREE SC with subject Claim 75 FREE SC", () => {
    const subject = "Time's Running Out — Claim 75 FREE SC!";
    const body =
      "We've unlocked a limited-time boost. $50 = 75,000 GC + 75 FREE SC + a Ruby Wheel Spin. purchase via our special $50 package labelled Thursday Night Spins.";
    const dm = extractDealMetricsRegex(subject, body, ["SC", "GC"]);
    assert.ok(dm, "expected deal");
    assert.equal(dm.you_pay, 50);
    assert.equal(dm.baseline_value, 75);
    assert.ok(dealStrengthPct(dm) >= 0.45, `expected ~50% bonus got ${dealStrengthPct(dm)}`);
  });

  it("Spinfinite Prime+: $44 = 44,000 GC + 1,000 Stars + 150 SC (no FREE on bundle line)", () => {
    const subject = "Unlock Prime+ Today for 150 FREE SC!";
    const body =
      "Your Prime+ access is here! Lock in 150 FREE SC over the next 30 days. $44 = 44,000 GC + 1,000 Stars + 150 SC Tap in and start your streak PURCHASE NOW";
    const dm = extractDealMetricsRegex(subject, body, ["SC", "GC"]);
    assert.ok(dm, "expected deal");
    assert.equal(dm.you_pay, 44);
    assert.equal(dm.baseline_value, 150);
    assert.equal(dm.units_comparable, false);
    assert.ok(dealStrengthPct(dm) >= 0.25, `expected strong bonus got ${dealStrengthPct(dm)}`);
    const deals = extractDealsFoundRegex(subject, body, ["SC", "GC"]);
    assert.ok(deals.length >= 1, "expected at least one deal in deals_found");
  });

  it("Spinfinite Prime+ full email copy with emoji and Terms and Conditions", () => {
    const subject = "Unlock Prime+ Today for 150 FREE SC!";
    const body =
      "Your Prime+ access is here! Lock in 150 FREE SC over the next 30 days 💰 $44 = 44,000 GC + 1,000 Stars + 150 SC Tap in and start your streak PURCHASE NOW Terms and Conditions: * Following purchase you will receive Gold Coins and an initial amount of free SC * The remaining free SC is credited over the course of the 30-day pass period.";
    const dm = extractDealMetricsRegex(subject, body, ["SC", "GC"]);
    assert.ok(dm, "expected deal");
    assert.equal(dm.you_pay, 44);
    assert.equal(dm.baseline_value, 150);
    const deals = extractDealsFoundRegex(subject, body, ["SC", "GC"]);
    assert.ok(deals.length >= 1, "expected at least one deal in deals_found");
  });

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

  it("Mega Bonanza multi-tier: extractDealsFoundRegex returns 3 tiers", () => {
    const body =
      "Take advantage of the Sizzlin' Stampede with three hot offers on Gold Coins, each claimable three times: 40,000 Gold Coins for $15.49 + 20 Free SC, 64,000 Gold Coins for $24.99 + 32 Free SC, and 90,000 Gold Coins for $34.99 + 45 Free SC. These offers are valid until May 22nd.";
    const deals = extractDealsFoundRegex("Somethin' hot just rode into town", body, ["SC", "GC"]);
    assert.equal(deals.length, 3);
    const pairs = deals.map((d) => [d.you_pay, d.baseline_value] as const);
    assert.ok(pairs.some(([p, s]) => p === 15.49 && s === 20));
    assert.ok(pairs.some(([p, s]) => p === 24.99 && s === 32));
    assert.ok(pairs.some(([p, s]) => p === 34.99 && s === 45));
    const best = deals.reduce((a, b) => (dealStrengthPct(b) > dealStrengthPct(a) ? b : a));
    const bestStrength = dealStrengthPct(best);
    assert.ok(bestStrength >= 0.25);
    assert.ok(bestStrength <= 0.4);
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
