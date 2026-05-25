import { z } from "zod";

const stringList = (max: number) =>
  z.preprocess(
    (val) => (Array.isArray(val) ? val.filter((x) => typeof x === "string") : []),
    z.array(z.string()).max(max).default([]),
  );

export const brandMemorySchema = z.object({
  favoritePhrases: stringList(20),
  recurringTopics: stringList(20),
  recurringJokes: stringList(20),
  recurringCTAs: stringList(20),
  recurringEnemies: stringList(20),
  memoryUpdatedAt: z.coerce.date().optional(),
});

export type BrandMemory = z.infer<typeof brandMemorySchema>;

export const brandPositioningSchema = z.object({
  primary: z.string().default(""),
  secondary: z.string().optional(),
});

export const brandAudienceRelationshipSchema = z.object({
  style: z.string().default(""),
});

export const brandEmotionalBaselineSchema = z.object({
  primary: z.string().default(""),
  secondary: z.string().optional(),
});

export const brandContradictionsSchema = z.object({
  primaryTrait: z.string().default(""),
  secondaryTrait: z.string().default(""),
});

export const brandContrastiveSchema = z.object({
  soundsLike: stringList(10),
  doesNotSoundLike: stringList(10),
});

export const brandColorProfileSchema = z.object({
  dominantColors: stringList(8),
  contrastLevel: z.string().default(""),
  saturationLevel: z.string().default(""),
  lightingMood: z.string().default(""),
});

export type BrandColorProfile = z.infer<typeof brandColorProfileSchema>;

export const visualPersonalitySchema = z.object({
  visualTone: z.string().default(""),
  compositionStyle: stringList(10),
  colorProfile: brandColorProfileSchema.default({
    dominantColors: [],
    contrastLevel: "",
    saturationLevel: "",
    lightingMood: "",
  }),
  textureStyle: stringList(10),
  typographyStyle: z.string().default(""),
  layoutBehavior: stringList(10),
  memeCompatibility: z.string().default(""),
  visualTaboos: stringList(15),
  visualArchetypes: stringList(10),
  recurringMotifs: stringList(15),
});

export type VisualPersonality = z.infer<typeof visualPersonalitySchema>;

export const sharedIdentitySchema = z.object({
  audienceType: z.string().default(""),
  internetCultureAlignment: z.string().default(""),
  sophisticationLevel: z.string().default(""),
  energyProfile: z.string().default(""),
  trustStyle: z.string().default(""),
});

export type SharedIdentity = z.infer<typeof sharedIdentitySchema>;

export const brandProfileSchema = z.object({
  positioning: brandPositioningSchema.default({ primary: "" }),
  audienceRelationship: brandAudienceRelationshipSchema.default({ style: "" }),
  emotionalBaseline: brandEmotionalBaselineSchema.default({ primary: "" }),
  taboos: stringList(15),
  rhetoricalPatterns: stringList(15),
  contentObjectives: stringList(10),
  contradictions: brandContradictionsSchema.default({
    primaryTrait: "",
    secondaryTrait: "",
  }),
  contrastive: brandContrastiveSchema.default({
    soundsLike: [],
    doesNotSoundLike: [],
  }),
  memory: brandMemorySchema.default({
    favoritePhrases: [],
    recurringTopics: [],
    recurringJokes: [],
    recurringCTAs: [],
    recurringEnemies: [],
  }),
  archetype: z.string().default(""),
  visualPersonality: visualPersonalitySchema.default({
    visualTone: "",
    compositionStyle: [],
    colorProfile: {
      dominantColors: [],
      contrastLevel: "",
      saturationLevel: "",
      lightingMood: "",
    },
    textureStyle: [],
    typographyStyle: "",
    layoutBehavior: [],
    memeCompatibility: "",
    visualTaboos: [],
    visualArchetypes: [],
    recurringMotifs: [],
  }),
  sharedIdentity: sharedIdentitySchema.default({
    audienceType: "",
    internetCultureAlignment: "",
    sophisticationLevel: "",
    energyProfile: "",
    trustStyle: "",
  }),
  confidence: z.number().min(0).max(1).default(0.5),
  visualConfidence: z.number().min(0).max(1).default(0.5),
  analyzedAt: z.coerce.date().optional(),
  corpusHash: z.string().optional(),
});

export type BrandProfile = z.infer<typeof brandProfileSchema>;

export const generationConstraintsSchema = z.object({
  positioning: z.string(),
  audienceRelationship: z.string(),
  emotionalBaseline: z.string(),
  taboos: z.array(z.string()),
  rhetoricalPatterns: z.array(z.string()),
  contentObjectives: z.array(z.string()),
  primaryTrait: z.string(),
  secondaryTrait: z.string(),
  soundsLike: z.array(z.string()),
  doesNotSoundLike: z.array(z.string()),
  favoritePhrases: z.array(z.string()),
  recurringTopics: z.array(z.string()),
  recurringCTAs: z.array(z.string()),
  recurringEnemies: z.array(z.string()),
  archetype: z.string().optional(),
  sharedIdentity: sharedIdentitySchema.optional(),
});

export type GenerationConstraints = z.infer<typeof generationConstraintsSchema>;

export function emptyVisualPersonality(): VisualPersonality {
  return visualPersonalitySchema.parse({});
}

export function emptySharedIdentity(): SharedIdentity {
  return sharedIdentitySchema.parse({});
}

export function emptyBrandMemory(): BrandMemory {
  return {
    favoritePhrases: [],
    recurringTopics: [],
    recurringJokes: [],
    recurringCTAs: [],
    recurringEnemies: [],
  };
}

export function emptyBrandProfile(): BrandProfile {
  return brandProfileSchema.parse({
    positioning: { primary: "" },
    audienceRelationship: { style: "" },
    emotionalBaseline: { primary: "" },
    taboos: [],
    rhetoricalPatterns: [],
    contentObjectives: [],
    contradictions: { primaryTrait: "", secondaryTrait: "" },
    contrastive: { soundsLike: [], doesNotSoundLike: [] },
    memory: emptyBrandMemory(),
    archetype: "",
    visualPersonality: emptyVisualPersonality(),
    sharedIdentity: emptySharedIdentity(),
    confidence: 0,
    visualConfidence: 0,
  });
}
