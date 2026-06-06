import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseContentFacts } from "./fact-extractor.js";

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
