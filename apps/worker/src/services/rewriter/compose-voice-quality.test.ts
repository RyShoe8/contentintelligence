import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentFactsSchema } from "@content-resourcer/db";
import {
  buildVoiceQualityWarning,
  composeStyleIssueTotal,
  evaluateComposeVoiceQuality,
  shouldRunComposeFinalPolish,
  shouldRunComposeVoicePolish,
} from "./compose-voice-quality.js";

describe("shouldRunComposeVoicePolish", () => {
  const emptyCounts = {
    voiceStyleIssueCount: 0,
    operatorVoiceIssueCount: 0,
    leakIssueCount: 0,
    faqStyleIssueCount: 0,
  };

  it("runs when links were woven", () => {
    assert.equal(
      shouldRunComposeVoicePolish({
        linksWoven: 2,
        linksRevised: false,
        styleIssueCounts: emptyCounts,
        genericityScore: 20,
      }),
      true,
    );
  });

  it("runs when links were revised", () => {
    assert.equal(
      shouldRunComposeVoicePolish({
        linksWoven: 0,
        linksRevised: true,
        styleIssueCounts: emptyCounts,
        genericityScore: 20,
      }),
      true,
    );
  });

  it("runs when style checks fail or genericity exceeds max", () => {
    assert.equal(
      shouldRunComposeVoicePolish({
        linksWoven: 0,
        linksRevised: false,
        styleIssueCounts: { ...emptyCounts, voiceStyleIssueCount: 1 },
        genericityScore: 20,
      }),
      true,
    );
    assert.equal(
      shouldRunComposeVoicePolish({
        linksWoven: 0,
        linksRevised: false,
        styleIssueCounts: emptyCounts,
        genericityScore: 45,
      }),
      true,
    );
  });

  it("skips when links clean and scores pass", () => {
    assert.equal(
      shouldRunComposeVoicePolish({
        linksWoven: 0,
        linksRevised: false,
        styleIssueCounts: emptyCounts,
        genericityScore: 30,
      }),
      false,
    );
  });
});

describe("shouldRunComposeFinalPolish", () => {
  it("runs when genericity exceeds max after hard voice loop", () => {
    const html = "<p>We test chairs. We reject bad specs.</p>";
    assert.equal(
      shouldRunComposeFinalPolish({ html, genericityScore: 45 }),
      true,
    );
  });

  it("runs when operator voice issues remain", () => {
    const html = [
      "<p>Designers and planners must consider how communities foster connections and holistic wellness across facilities.</p>",
      "<p>".repeat(20),
      "Residents need thoughtful integration of outdoor amenities and social interaction programs.",
      "</p>",
    ].join("");
    assert.equal(
      shouldRunComposeFinalPolish({ html, genericityScore: 20 }),
      true,
    );
  });

  it("skips when scores and style checks pass", () => {
    const html = [
      "<h2>Chairs we actually sit in</h2>",
      "<p>We test every chair before we specify it. We reject catalog seating that fails after six months.</p>",
      "<p>Our team sits in each model ourselves before we put it on a plan.</p>",
      "<p>We look for durability first and comfort second when we specify seating.</p>",
      "<p>We never specify seating we have not tested ourselves in our own communities.</p>",
    ].join("");
    assert.equal(
      shouldRunComposeFinalPolish({ html, genericityScore: 25 }),
      false,
    );
  });
});

describe("buildVoiceQualityWarning", () => {
  const emptyCounts = {
    voiceStyleIssueCount: 0,
    operatorVoiceIssueCount: 0,
    leakIssueCount: 0,
    faqStyleIssueCount: 0,
  };

  it("returns undefined when gate passes", () => {
    assert.equal(
      buildVoiceQualityWarning({
        gateOk: true,
        noDrift: true,
        genericityOk: true,
        effectiveBc: 90,
        genericityScore: 20,
        styleIssueCounts: emptyCounts,
        completenessIssues: [],
      }),
      undefined,
    );
  });

  it("summarizes genericity and brand consistency failures", () => {
    const warning = buildVoiceQualityWarning({
      gateOk: false,
      noDrift: false,
      genericityOk: false,
      effectiveBc: 75,
      genericityScore: 45,
      styleIssueCounts: { ...emptyCounts, voiceStyleIssueCount: 1 },
      completenessIssues: [],
    });
    assert.match(warning ?? "", /Genericity 45 exceeds max 38/);
    assert.match(warning ?? "", /Brand consistency 75 below target 85/);
    assert.match(warning ?? "", /Voice style checks flagged/);
  });
});

describe("evaluateComposeVoiceQuality", () => {
  it("evaluates warning from final HTML not pre-link snapshot", () => {
    const facts = contentFactsSchema.parse({
      contentType: "hybrid",
      keyDetails: ["Wide doorways help mobility", "Lighting affects mood"],
    });
    const html = [
      "<h2>Chairs we actually sit in</h2>",
      "<p>We test every chair before we specify it. Wide doorways help mobility and lighting affects mood.</p>",
    ].join("");
    const result = evaluateComposeVoiceQuality({
      facts,
      html,
      critique: {
        humanAuthenticity: 85,
        brandConsistency: 90,
        genericity: 20,
        issues: [],
      },
      genericity: { score: 45, issues: ["Neutral industry guide tone"] },
    });
    assert.equal(result.genericityScore, 45);
    assert.equal(result.brandConsistencyScore, 90);
    assert.match(result.voiceQualityWarning ?? "", /Genericity 45 exceeds max 38/);
  });
});

describe("composeStyleIssueTotal", () => {
  it("sums all style issue buckets", () => {
    assert.equal(
      composeStyleIssueTotal({
        voiceStyleIssueCount: 1,
        operatorVoiceIssueCount: 2,
        leakIssueCount: 0,
        faqStyleIssueCount: 1,
      }),
      4,
    );
  });
});
