import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandProfileSchema } from "@content-resourcer/db";
import {
  assembleGenerationConstraints,
  formatConstraintsForPrompt,
} from "./assemble-generation-constraints.js";

describe("assembleGenerationConstraints", () => {
  it("flattens brand profile into generation constraints", () => {
    const profile = brandProfileSchema.parse({
      positioning: { primary: "anti-corporate optimizer" },
      audienceRelationship: { style: "co-conspirator" },
      emotionalBaseline: { primary: "skeptical optimism" },
      taboos: ["avoid hype"],
      rhetoricalPatterns: ["hook question"],
      contentObjectives: ["engagement"],
      contradictions: { primaryTrait: "analytical", secondaryTrait: "sarcastic" },
      contrastive: {
        soundsLike: ["insider"],
        doesNotSoundLike: ["affiliate"],
      },
      memory: {
        favoritePhrases: ["free EV"],
        recurringTopics: ["bankroll"],
        recurringJokes: [],
        recurringCTAs: ["grab it"],
        recurringEnemies: ["fake gurus"],
      },
      confidence: 0.7,
    });

    const constraints = assembleGenerationConstraints(profile);
    assert.equal(constraints.positioning, "anti-corporate optimizer");
    assert.equal(constraints.audienceRelationship, "co-conspirator");
    assert.deepEqual(constraints.favoritePhrases, ["free EV"]);
    assert.match(formatConstraintsForPrompt(constraints), /doesNotSoundLike/);
  });
});
