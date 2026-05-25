import type { BrandProfile, GenerationConstraints } from "@content-resourcer/db";

export function assembleGenerationConstraints(profile: BrandProfile): GenerationConstraints {
  const emotional = profile.emotionalBaseline.secondary
    ? `${profile.emotionalBaseline.primary} (${profile.emotionalBaseline.secondary})`
    : profile.emotionalBaseline.primary;

  const shared = profile.sharedIdentity;
  const hasShared =
    shared.audienceType ||
    shared.internetCultureAlignment ||
    shared.energyProfile ||
    shared.trustStyle;

  return {
    positioning: profile.positioning.primary,
    audienceRelationship: profile.audienceRelationship.style,
    emotionalBaseline: emotional,
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
    archetype: profile.archetype || undefined,
    sharedIdentity: hasShared ? shared : undefined,
  };
}

export function formatConstraintsForPrompt(constraints: GenerationConstraints): string {
  return JSON.stringify(constraints, null, 2);
}
