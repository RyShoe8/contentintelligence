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
});
