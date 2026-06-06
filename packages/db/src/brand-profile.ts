import { z } from "zod";

function scalarToString(val: unknown, maxLen = 500): string {
  if (val == null) return "";
  if (typeof val === "string") return val.trim().slice(0, maxLen);
  if (typeof val === "number" || typeof val === "boolean") {
    return String(val).trim().slice(0, maxLen);
  }
  if (Array.isArray(val)) {
    return val
      .map((x) => (typeof x === "string" ? x.trim() : String(x).trim()))
      .filter(Boolean)
      .join("; ")
      .slice(0, maxLen);
  }
  return "";
}

function coercedString(max = 500) {
  return z.preprocess(
    (val) => scalarToString(val, max),
    z.string().max(max).default(""),
  );
}

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
  favoriteOpenings: stringList(20),
  favoriteClosings: stringList(20),
  favoriteTransitions: stringList(20),
  recurringOpinions: stringList(20),
  recurringWarnings: stringList(20),
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
  contrastLevel: coercedString(),
  saturationLevel: coercedString(),
  lightingMood: coercedString(),
});

export type BrandColorProfile = z.infer<typeof brandColorProfileSchema>;

export const visualPersonalitySchema = z.object({
  visualTone: coercedString(),
  compositionStyle: stringList(10),
  colorProfile: brandColorProfileSchema.default({
    dominantColors: [],
    contrastLevel: "",
    saturationLevel: "",
    lightingMood: "",
  }),
  textureStyle: stringList(10),
  typographyStyle: coercedString(),
  layoutBehavior: stringList(10),
  memeCompatibility: coercedString(),
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
  return brandMemorySchema.parse({});
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
