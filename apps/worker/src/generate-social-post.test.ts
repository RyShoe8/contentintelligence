import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandProfileSchema } from "@content-resourcer/db";
import { assembleGenerationConstraints } from "./services/constraints/assemble-generation-constraints.js";
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

  it("returns fallback copy without OpenAI when constraints are provided", async () => {
    const profile = brandProfileSchema.parse({
      positioning: { primary: "insider optimizer" },
      audienceRelationship: { style: "co-conspirator" },
      emotionalBaseline: { primary: "skeptical optimism" },
      taboos: ["avoid hype"],
      rhetoricalPatterns: ["hook question"],
      contentObjectives: ["conversion"],
      contradictions: { primaryTrait: "analytical", secondaryTrait: "accessible" },
      contrastive: { soundsLike: ["insider"], doesNotSoundLike: ["affiliate"] },
      memory: {
        favoritePhrases: [],
        recurringTopics: [],
        recurringJokes: [],
        recurringCTAs: [],
        recurringEnemies: [],
      },
      confidence: 0.5,
    });

    const deal = {
      you_pay: 10,
      pay_unit: "USD",
      baseline_value: 20,
      credit_unit: "SC",
      effective_savings_pct: 0.5,
      bonus_pct: 0.5,
      units_comparable: true,
      confidence: 0.9,
    };

    const copy = await generateSocialPostCopy({
      title: "Bonus drop",
      deal,
      constraints: assembleGenerationConstraints(profile),
    });

    assert.match(copy, /Bonus drop|10|20/);
  });

  it("returns fallback copy without OpenAI when no deal is provided", async () => {
    const copy = await generateSocialPostCopy({
      title: "Weekly newsletter",
      summary: "New games and community highlights this week.",
      signalName: "Casinos",
      persona: "Write like a friendly insider.",
    });

    assert.match(copy, /Weekly newsletter/);
    assert.match(copy, /community highlights/);
  });
});
