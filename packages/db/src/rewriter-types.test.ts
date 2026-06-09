import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findRewriterBlacklistMatches } from "./rewriter-blacklist.js";
import {
  rewriterQualityCompositeScore,
  rewriterQualityGatePassed,
  rewriterProceduralCompletenessIssues,
  rewriterProceduralQualityGatePassed,
  rewriterNarrativeCompletenessIssues,
  rewriterHybridQualityGatePassed,
  rewriterComposeCompletenessIssues,
  rewriterComposeQualityGatePassed,
  REWRITER_COMPOSE_GENERICITY_MAX,
  composeGenericityScore,
  contentFactsSchema,
  brandInterpretationSchema,
} from "./rewriter-types.js";

const outlookHybridFacts = contentFactsSchema.parse({
  contentType: "hybrid",
  narrativeSections: [
    {
      title: "Why Your Outlook Signature Matters",
      points: ["Reinforces brand", "Makes contact easy", "Creates professional impression"],
    },
    {
      title: "Frequently Asked Questions",
      points: [
        "Can I have multiple signatures?",
        "Can I use different signatures for replies?",
      ],
    },
  ],
  sections: [
    {
      title: "Outlook for Windows",
      steps: ["Open File > Options", "Select Mail > Signatures", "Click OK"],
    },
    {
      title: "Outlook on the Web",
      steps: ["Open Settings", "Select Mail > Compose and reply", "Click Save"],
    },
  ],
  keyDetails: ["Guide covers multiple Outlook versions"],
});

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

  it("parses hybrid narrative and procedural sections", () => {
    assert.equal(outlookHybridFacts.contentType, "hybrid");
    assert.equal(outlookHybridFacts.narrativeSections?.length, 2);
    assert.equal(outlookHybridFacts.sections?.length, 2);
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

  it("checks procedural sections on hybrid facts", () => {
    const html = [
      "<h2>Why Your Outlook Signature Matters</h2><p>Reinforces brand and makes contact easy.</p>",
      "<h2>Outlook for Windows</h2><ol><li>Open File > Options</li><li>Select Mail > Signatures</li><li>Click OK</li></ol>",
    ].join("");
    const issues = rewriterProceduralCompletenessIssues(outlookHybridFacts, html);
    assert.ok(issues.some((i) => i.includes("Outlook on the Web")));
  });
});

describe("rewriterNarrativeCompletenessIssues", () => {
  it("detects missing FAQ narrative section", () => {
    const html = [
      "<h2>Why Your Outlook Signature Matters</h2><p>Reinforces brand and makes contact easy for readers.</p>",
      "<h2>Outlook for Windows</h2><ol><li>Open File > Options</li></ol>",
    ].join("");
    const issues = rewriterNarrativeCompletenessIssues(outlookHybridFacts, html);
    assert.ok(issues.some((i) => i.includes("Frequently Asked Questions")));
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

describe("rewriterHybridQualityGatePassed", () => {
  it("passes when narrative, procedural, and brand scores are complete", () => {
    const html = [
      "<h2>Why Your Outlook Signature Matters</h2><p>Reinforces brand and makes contact easy for a professional impression.</p>",
      "<h2>Frequently Asked Questions</h2><ul><li>Can I have multiple signatures?</li><li>Can I use different signatures for replies?</li></ul>",
      "<h2>Outlook for Windows</h2><ol><li>Open File > Options</li><li>Select Mail > Signatures</li><li>Click OK</li></ol>",
      "<h2>Outlook on the Web</h2><ol><li>Open Settings</li><li>Select Mail > Compose and reply</li><li>Click Save</li></ol>",
    ].join("");
    assert.equal(
      rewriterHybridQualityGatePassed(outlookHybridFacts, html, {
        humanAuthenticity: 85,
        brandConsistency: 82,
        genericity: 75,
        issues: [],
      }),
      true,
    );
  });
});

const composeResearchFacts = contentFactsSchema.parse({
  contentType: "hybrid",
  narrativeSections: [
    { title: "Topic overview", points: ["Online winnings are taxable income"] },
    { title: "Key facts", points: ["Federal withholding may apply", "State rules vary"] },
  ],
  keyDetails: ["Report all gambling winnings", "Keep records of wins and losses"],
});

describe("rewriterComposeCompletenessIssues", () => {
  it("requires facts but not research-brief section titles", () => {
    const html = [
      "<h2>What winners owe at tax time</h2>",
      "<p>Online winnings are taxable income. Federal withholding may apply and state rules vary.</p>",
      "<p>Report all gambling winnings and keep records of wins and losses.</p>",
    ].join("");
    assert.equal(rewriterComposeCompletenessIssues(composeResearchFacts, html).length, 0);
  });

  it("flags missing research facts", () => {
    const html = "<h2>Tax basics</h2><p>Online winnings are taxable income.</p>";
    const issues = rewriterComposeCompletenessIssues(composeResearchFacts, html);
    assert.ok(issues.length > 0);
    assert.ok(!issues.some((i) => i.includes("Topic overview")));
  });
});

describe("rewriterComposeQualityGatePassed", () => {
  it("passes compose articles with facts covered in editorial voice", () => {
    const html = [
      "<h2>What winners owe at tax time</h2>",
      "<p>Online winnings are taxable income. Federal withholding may apply and state rules vary.</p>",
      "<p>Report all gambling winnings and keep records of wins and losses.</p>",
    ].join("");
    assert.equal(
      rewriterComposeQualityGatePassed(
        composeResearchFacts,
        html,
        {
          humanAuthenticity: 85,
          brandConsistency: 86,
          genericity: 20,
          issues: [],
        },
        { score: 18, issues: [] },
      ),
      true,
    );
  });

  it("fails when genericity exceeds compose max", () => {
    const html = "<h2>Tax basics</h2><p>Online winnings are taxable income.</p>";
    assert.equal(
      rewriterComposeQualityGatePassed(
        composeResearchFacts,
        html,
        {
          humanAuthenticity: 90,
          brandConsistency: 90,
          genericity: 65,
          issues: [],
        },
        { score: 65, issues: [] },
      ),
      false,
    );
    assert.equal(
      composeGenericityScore({ score: 65, issues: [] }, {
        humanAuthenticity: 90,
        brandConsistency: 90,
        genericity: 40,
        issues: [],
      }),
      65,
    );
    assert.equal(REWRITER_COMPOSE_GENERICITY_MAX, 45);
  });
});
