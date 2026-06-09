import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterFaqNarrativeSections,
  flattenBriefToKeyDetails,
  parseBriefSectionsByHeaders,
  parseContentFacts,
} from "./fact-extractor.js";

describe("parseContentFacts", () => {
  it("parses valid LLM JSON", () => {
    const facts = parseContentFacts({
      offer: "100% match",
      keyDetails: ["Minimum deposit $20", "Wagering applies"],
    });
    assert.ok(facts);
    assert.equal(facts!.offer, "100% match");
    assert.equal(facts!.keyDetails.length, 2);
  });

  it("returns null for invalid payloads", () => {
    assert.equal(parseContentFacts({ keyDetails: "not-an-array" }), null);
    assert.equal(parseContentFacts(null), null);
  });

  it("parses procedural sections with contentType", () => {
    const facts = parseContentFacts({
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
      keyDetails: ["Update your email signature in Outlook"],
    });
    assert.ok(facts);
    assert.equal(facts!.contentType, "procedural");
    assert.equal(facts!.sections?.length, 2);
  });

  it("parses hybrid narrative and procedural sections", () => {
    const facts = parseContentFacts({
      contentType: "hybrid",
      narrativeSections: [
        {
          title: "Why Your Outlook Signature Matters",
          points: ["Reinforces brand", "Makes contact easy"],
        },
        {
          title: "Frequently Asked Questions",
          points: ["Can I have multiple signatures?"],
        },
      ],
      sections: [
        {
          title: "Outlook for Windows",
          steps: ["Open File > Options", "Select Mail > Signatures"],
        },
        {
          title: "Outlook on the Web",
          steps: ["Open Settings", "Click Save"],
        },
      ],
      keyDetails: ["Outlook signature guide"],
    });
    assert.ok(facts);
    assert.equal(facts!.contentType, "hybrid");
    assert.equal(facts!.narrativeSections?.length, 2);
    assert.equal(facts!.sections?.length, 2);
  });
});

describe("parseBriefSectionsByHeaders", () => {
  it("parses labeled research brief sections into narrative blocks", () => {
    const brief = [
      "Topic Overview:",
      "Tax on casino winnings is complex.",
      "",
      "Key Facts:",
      "1. All winnings are taxable under federal law (source: https://example.com/tax)",
      "- State rates vary",
      "",
      "FAQ ideas:",
      "- How do I report winnings?",
    ].join("\n");

    const sections = parseBriefSectionsByHeaders(brief);
    assert.ok(sections.length >= 2);
    assert.equal(sections[0]?.title, "Topic Overview");
    assert.match(sections[1]?.points.join(" "), /taxable under federal law/);
  });
});

describe("flattenBriefToKeyDetails", () => {
  it("flattens brief headers into keyDetails without narrative section buckets", () => {
    const brief = [
      "Topic Overview:",
      "Senior living design focuses on comfort.",
      "",
      "Key Facts:",
      "- Lighting affects mood",
      "- Chairs must pass the sit test",
    ].join("\n");

    const facts = flattenBriefToKeyDetails(brief);
    assert.ok(facts.keyDetails.length >= 2);
    assert.equal(facts.narrativeSections?.length ?? 0, 0);
    assert.match(facts.keyDetails.join(" "), /sit test/i);
  });

  it("parses faqItems when includeFaq is true", () => {
    const facts = parseContentFacts({
      contentType: "hybrid",
      keyDetails: ["Design matters"],
      faqItems: [{ question: "Why chairs?", answer: "Comfort drives retention." }],
    });
    assert.ok(facts);
    assert.equal(facts!.faqItems?.length, 1);
    assert.equal(facts!.faqItems?.[0]?.question, "Why chairs?");
  });
});

describe("filterFaqNarrativeSections", () => {
  it("removes FAQ-titled narrative sections", () => {
    const filtered = filterFaqNarrativeSections([
      { title: "Key facts", points: ["Fact one"] },
      { title: "FAQ ideas", points: ["Q: Who pays? A: The player."] },
      { title: "Frequently Asked Questions", points: ["Q: When? A: Annually."] },
    ]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.title, "Key facts");
  });
});
