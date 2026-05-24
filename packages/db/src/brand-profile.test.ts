import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandProfileSchema, emptyBrandProfile } from "./brand-profile.js";

describe("brandProfileSchema", () => {
  it("parses empty profile defaults", () => {
    const parsed = emptyBrandProfile();
    assert.equal(parsed.positioning.primary, "");
    assert.deepEqual(parsed.memory.favoritePhrases, []);
  });

  it("parses full profile", () => {
    const parsed = brandProfileSchema.parse({
      positioning: { primary: "anti-corporate optimizer", secondary: "deal hunter" },
      audienceRelationship: { style: "co-conspirator" },
      emotionalBaseline: { primary: "skeptical optimism" },
      taboos: ["avoid corporate phrasing"],
      rhetoricalPatterns: ["starts with hook question"],
      contentObjectives: ["engagement"],
      contradictions: { primaryTrait: "analytical", secondaryTrait: "sarcastic" },
      contrastive: {
        soundsLike: ["savvy insider"],
        doesNotSoundLike: ["corporate affiliate"],
      },
      memory: {
        favoritePhrases: ["don't get rinsed"],
        recurringTopics: ["promo optimization"],
        recurringJokes: [],
        recurringCTAs: [],
        recurringEnemies: ["predatory casinos"],
      },
      confidence: 0.8,
    });
    assert.equal(parsed.positioning.primary, "anti-corporate optimizer");
    assert.equal(parsed.memory.favoritePhrases[0], "don't get rinsed");
  });
});
