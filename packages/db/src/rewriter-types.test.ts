import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findRewriterBlacklistMatches } from "./rewriter-blacklist.js";
import {
  rewriterQualityCompositeScore,
  rewriterQualityGatePassed,
  rewriterProceduralCompletenessIssues,
  rewriterProceduralQualityGatePassed,
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

  it("parses procedural sections", () => {
    const parsed = contentFactsSchema.parse({
      contentType: "procedural",
      sections: [
        {
          title: "Outlook 2016",
          steps: ["Open File > Options > Mail", "Click Signatures"],
        },
      ],
      keyDetails: ["How to set a signature in Outlook"],
    });
    assert.equal(parsed.contentType, "procedural");
    assert.equal(parsed.sections?.length, 1);
    assert.equal(parsed.sections?.[0]?.steps.length, 2);
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

describe("rewriterProceduralCompletenessIssues", () => {
  const proceduralFacts = contentFactsSchema.parse({
    contentType: "procedural",
    sections: [
      {
        title: "Outlook 2016",
        steps: ["Open File > Options > Mail", "Click Signatures"],
      },
      {
        title: "Outlook on the web",
        steps: ["Open Settings", "Go to Mail > Compose and reply"],
      },
    ],
    keyDetails: [],
  });

  it("detects missing section and steps", () => {
    const html =
      "<h2>Outlook 2016</h2><ol><li>Open File > Options > Mail</li></ol>";
    const issues = rewriterProceduralCompletenessIssues(proceduralFacts, html);
    assert.ok(issues.some((i) => i.includes("Outlook on the web")));
    assert.ok(issues.some((i) => i.includes("missing 1/2 steps")));
  });

  it("passes when all sections and steps are present", () => {
    const html = [
      "<h2>Outlook 2016</h2><ol><li>Open File > Options > Mail</li><li>Click Signatures</li></ol>",
      "<h2>Outlook on the web</h2><ol><li>Open Settings</li><li>Go to Mail > Compose and reply</li></ol>",
    ].join("");
    const issues = rewriterProceduralCompletenessIssues(proceduralFacts, html);
    assert.equal(issues.length, 0);
  });
});

describe("rewriterProceduralQualityGatePassed", () => {
  it("passes with completeness and brand scores even when genericity would fail default gate", () => {
    const facts = contentFactsSchema.parse({
      contentType: "procedural",
      sections: [{ title: "Outlook 2016", steps: ["Open File > Options > Mail"] }],
      keyDetails: [],
    });
    const html =
      "<h2>Outlook 2016</h2><ol><li>Open File > Options > Mail</li></ol>";
    assert.equal(
      rewriterProceduralQualityGatePassed(facts, html, {
        humanAuthenticity: 85,
        brandConsistency: 82,
        genericity: 75,
        issues: [],
      }),
      true,
    );
  });
});
