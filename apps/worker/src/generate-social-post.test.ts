import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateSocialPostCopy } from "./generate-social-post.js";

describe("generateSocialPostCopy persona", () => {
  it("returns fallback copy without OpenAI when persona is provided", async () => {
    const deal = {
      you_pay: 44,
      pay_unit: "USD",
      baseline_value: 150,
      credit_unit: "SC",
      effective_savings_pct: 0.5,
      bonus_pct: 0.5,
      units_comparable: true,
      confidence: 0.9,
    };

    const copy = await generateSocialPostCopy({
      title: "Prime deal",
      deal,
      signalName: "Casinos",
      persona: "Write like a pirate.",
    });

    assert.match(copy, /Prime deal|44|150/);
  });
});
