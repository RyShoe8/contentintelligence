import { sharedIdentitySchema, type SharedIdentity, type VisualPersonality } from "@content-resourcer/db";
import type { CoreBrandAnalysis } from "./extract-brand-dna.js";
import { env } from "../../env.js";
import { coerceLlmString } from "../llm/coerce-llm-field.js";
import { completeJson } from "../llm/json-completion.js";

type SharedJson = {
  audienceType?: string;
  internetCultureAlignment?: string;
  sophisticationLevel?: string;
  energyProfile?: string;
  trustStyle?: string;
  archetype?: string;
};

export function fallbackSharedIdentity(voiceName: string): SharedIdentity {
  return sharedIdentitySchema.parse({
    audienceType: `${voiceName} target audience`,
    internetCultureAlignment: "general promotional social",
    sophisticationLevel: "mainstream",
    energyProfile: "confident urgency",
    trustStyle: "trusted advisor",
  });
}

export async function synthesizeSharedIdentity(opts: {
  voiceName: string;
  keywords: string[];
  core: CoreBrandAnalysis;
  visual: VisualPersonality;
}): Promise<{ shared: SharedIdentity; archetype: string }> {
  const copyBlock = [
    `Positioning: ${opts.core.positioning.primary}`,
    opts.core.positioning.secondary ? `Secondary: ${opts.core.positioning.secondary}` : null,
    `Audience: ${opts.core.audienceRelationship.style}`,
    `Emotional: ${opts.core.emotionalBaseline.primary}`,
    `Sounds like: ${opts.core.contrastive.soundsLike.join("; ")}`,
    `Does not sound like: ${opts.core.contrastive.doesNotSoundLike.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const visualBlock = [
    `Visual tone: ${opts.visual.visualTone}`,
    `Composition: ${opts.visual.compositionStyle.join("; ")}`,
    `Colors: ${opts.visual.colorProfile.dominantColors.join(", ")}`,
    `Meme compatibility: ${opts.visual.memeCompatibility}`,
  ].join("\n");

  const user = [
    `Brand: ${opts.voiceName}`,
    opts.keywords.length ? `Keywords: ${opts.keywords.join(", ")}` : null,
    "",
    "Copy profile:",
    copyBlock,
    "",
    "Visual profile:",
    visualBlock,
  ]
    .filter((x) => x != null)
    .join("\n");

  const parsed = await completeJson<SharedJson>({
    system: `Synthesize shared identity that unifies copy and visual personality for one brand.
Return JSON: audienceType, internetCultureAlignment, sophisticationLevel, energyProfile, trustStyle, archetype (short label e.g. "irreverent insider").`,
    user,
    maxTokens: env.maxTokensBrandAnalyze,
  });

  if (!parsed) {
    return { shared: fallbackSharedIdentity(opts.voiceName), archetype: "" };
  }

  const shared = sharedIdentitySchema.parse({
    audienceType: coerceLlmString(parsed.audienceType),
    internetCultureAlignment: coerceLlmString(parsed.internetCultureAlignment),
    sophisticationLevel: coerceLlmString(parsed.sophisticationLevel),
    energyProfile: coerceLlmString(parsed.energyProfile),
    trustStyle: coerceLlmString(parsed.trustStyle),
  });

  return {
    shared,
    archetype: coerceLlmString(parsed.archetype, 120),
  };
}
