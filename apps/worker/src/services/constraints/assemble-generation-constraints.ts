import type { BrandProfile, GenerationConstraints } from "@content-resourcer/db";

export function assembleGenerationConstraints(profile: BrandProfile): GenerationConstraints {
  return {
    positioning: profile.positioning.primary,
    audienceRelationship: profile.audienceRelationship.style,
    emotionalBaseline: profile.emotionalBaseline.primary,
    taboos: profile.taboos,
    rhetoricalPatterns: profile.rhetoricalPatterns,
    contentObjectives: profile.contentObjectives,
    primaryTrait: profile.contradictions.primaryTrait,
    secondaryTrait: profile.contradictions.secondaryTrait,
    soundsLike: profile.contrastive.soundsLike,
    doesNotSoundLike: profile.contrastive.doesNotSoundLike,
    favoritePhrases: profile.memory.favoritePhrases,
    recurringTopics: profile.memory.recurringTopics,
    recurringCTAs: profile.memory.recurringCTAs,
    recurringEnemies: profile.memory.recurringEnemies,
  };
}

export function formatConstraintsForPrompt(constraints: GenerationConstraints): string {
  return JSON.stringify(constraints, null, 2);
}
