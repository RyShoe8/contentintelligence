import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeGenericityDeterministic } from "./generic-detector.js";

describe("analyzeGenericityDeterministic", () => {
  it("flags blacklisted phrases in HTML", () => {
    const result = analyzeGenericityDeterministic(
      "<p>Act now and maximize your fun before you miss out!</p>",
    );
    assert.ok(result.score > 0);
    assert.ok(result.issues.some((i) => i.includes("act now")));
    assert.ok(result.issues.some((i) => i.includes("maximize your fun")));
  });

  it("returns low score for neutral editorial copy", () => {
    const result = analyzeGenericityDeterministic(
      "<p>The bonus requires a $20 deposit and standard wagering terms apply.</p>",
    );
    assert.ok(result.score < 30);
    assert.equal(result.issues.length, 0);
  });
});
