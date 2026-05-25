import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyBrandProfile } from "@content-resourcer/db";
import { buildImagePrompt } from "./build-image-prompt.js";

describe("buildImagePrompt", () => {
  it("includes visual tone and taboos", () => {
    const profile = emptyBrandProfile();
    profile.visualPersonality.visualTone = "dark fintech dashboard";
    profile.visualPersonality.visualTaboos = ["avoid jackpot aesthetics"];
    profile.sharedIdentity.audienceType = "online gamblers";

    const prompt = buildImagePrompt({
      profile,
      post: {
        title: "50% bonus",
        social_copy: "Sharp deal breakdown",
        deal_metrics: {
          you_pay: 10,
          baseline_value: 20,
          mode: "pay_vs_credited_value",
          confidence: 0.5,
          effective_savings_pct: 0.5,
          bonus_pct: 0,
          units_comparable: true,
          source: "regex",
        },
      },
    });

    assert.match(prompt, /dark fintech dashboard/i);
    assert.match(prompt, /avoid jackpot/i);
    assert.match(prompt, /online gamblers/i);
    assert.match(prompt, /no text overlays/i);
  });
});
