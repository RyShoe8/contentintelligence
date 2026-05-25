import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandProfileSchema, emptyBrandProfile } from "./brand-profile.js";

describe("brandProfileSchema", () => {
  it("parses empty profile defaults", () => {
    const parsed = emptyBrandProfile();
    assert.equal(parsed.positioning.primary, "");
    assert.deepEqual(parsed.memory.favoritePhrases, []);
    assert.equal(parsed.visualPersonality.visualTone, "");
    assert.equal(parsed.sharedIdentity.audienceType, "");
  });

  it("parses full profile", () => {
    const parsed = brandProfileSchema.parse({
      positioning: { primary: "anti-corporate optimizer", secondary: "deal hunter" },
      audienceRelationship: { style: "co-conspirator" },
      emotionalBaseline: { primary: "skeptical optimism", secondary: "irony" },
      taboos: ["avoid generic hype"],
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
      archetype: "irreverent insider",
      visualPersonality: {
        visualTone: "dark sportsbook UI",
        compositionStyle: ["dashboard overlay"],
        colorProfile: {
          dominantColors: ["#0a0a0a", "#22c55e"],
          contrastLevel: "high",
          saturationLevel: "moderate",
          lightingMood: "moody",
        },
        visualTaboos: ["avoid Vegas glamour"],
      },
      sharedIdentity: {
        audienceType: "bankroll-conscious gamblers",
        energyProfile: "skeptical opportunism",
      },
      confidence: 0.8,
      visualConfidence: 0.7,
    });
    assert.equal(parsed.positioning.primary, "anti-corporate optimizer");
    assert.equal(parsed.archetype, "irreverent insider");
    assert.equal(parsed.visualPersonality.visualTone, "dark sportsbook UI");
    assert.equal(parsed.sharedIdentity.audienceType, "bankroll-conscious gamblers");
    assert.equal(parsed.emotionalBaseline.secondary, "irony");
  });

  it("parses legacy profile without visual fields", () => {
    const parsed = brandProfileSchema.parse({
      positioning: { primary: "legacy brand" },
      audienceRelationship: { style: "advisor" },
      emotionalBaseline: { primary: "calm" },
      taboos: [],
      rhetoricalPatterns: [],
      contentObjectives: [],
      contradictions: { primaryTrait: "", secondaryTrait: "" },
      contrastive: { soundsLike: [], doesNotSoundLike: [] },
      memory: {
        favoritePhrases: [],
        recurringTopics: [],
        recurringJokes: [],
        recurringCTAs: [],
        recurringEnemies: [],
      },
      confidence: 0.5,
    });
    assert.equal(parsed.visualPersonality.visualTone, "");
    assert.equal(parsed.sharedIdentity.audienceType, "");
  });
});
