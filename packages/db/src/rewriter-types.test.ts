import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findRewriterBlacklistMatches } from "./rewriter-blacklist.js";
import {
  rewriterQualityCompositeScore,
  rewriterQualityGatePassed,
  contentFactsSchema,
  brandInterpretationSchema,
} from "./rewriter-types.js";

describe("contentFactsSchema", () => {
  it("parses optional promo fields and keyDetails", () => {
    const parsed = contentFactsSchema.parse({
      offer: "75 SC",
      depositAmount: "$50",
      keyDetails: ["Minimum deposit applies", "Terms apply"],
    });
    assert.equal(parsed.offer, "75 SC");
    assert.equal(parsed.keyDetails.length, 2);
  });
});

describe("rewriterQualityGatePassed", () => {
  it("passes when scores meet thresholds", () => {
    assert.equal(
      rewriterQualityGatePassed(
        { score: 20, issues: [] },
        { humanAuthenticity: 85, brandConsistency: 82, genericity: 15, issues: [] },
      ),
      true,
    );
  });

  it("fails when genericity analysis is too high", () => {
    assert.equal(
      rewriterQualityGatePassed(
        { score: 75, issues: ["promotional"] },
        { humanAuthenticity: 90, brandConsistency: 90, genericity: 10, issues: [] },
      ),
      false,
    );
  });
});

describe("findRewriterBlacklistMatches", () => {
  it("detects blacklisted phrases case-insensitively", () => {
    const hits = findRewriterBlacklistMatches("Act now and maximize your fun today!");
    assert.ok(hits.includes("act now"));
    assert.ok(hits.includes("maximize your fun"));
  });
});

describe("rewriterQualityCompositeScore", () => {
  it("weights human authenticity, brand consistency, and low genericity", () => {
    const score = rewriterQualityCompositeScore({
      humanAuthenticity: 90,
      brandConsistency: 90,
      genericity: 10,
      issues: [],
    });
    assert.ok(score >= 85);
  });
});

describe("brandInterpretationSchema", () => {
  it("coerces qualityScore", () => {
    const parsed = brandInterpretationSchema.parse({
      assessment: "Solid value",
      qualityScore: "7",
      bestFor: "casual players",
      risks: [],
      caveats: ["read terms"],
      opportunities: [],
    });
    assert.equal(parsed.qualityScore, 7);
  });
});
