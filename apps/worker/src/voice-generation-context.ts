import type { GenerationConstraints, SocialPlatformId, Voice } from "@content-resourcer/db";
import { assembleGenerationConstraints } from "./services/constraints/assemble-generation-constraints.js";
import {
  mergeTaboosWithGlobal,
  type VoicePreferredPhraseLike,
} from "./voice-style-rules.js";

export type VoiceGenerationContext = {
  voiceId?: string;
  brandName?: string;
  brandMentionLevel?: number;
  preferredPhrases?: VoicePreferredPhraseLike[];
  persona?: string;
  constraints?: GenerationConstraints;
  distributionPlatforms?: SocialPlatformId[];
};

function voiceStyleFields(voice: Voice) {
  return {
    brandName: voice.name,
    brandMentionLevel: voice.brand_mention_level ?? 50,
    preferredPhrases: voice.preferred_phrases ?? [],
  };
}

export function resolveVoiceGenerationContext(voice: Voice | null): VoiceGenerationContext {
  if (!voice || voice.persona_status !== "ready") {
    return {};
  }

  const style = voiceStyleFields(voice);

  const distributionPlatforms = voice.distribution_platforms ?? [];

  if (voice.brand_profile) {
    const constraints = assembleGenerationConstraints(voice.brand_profile);
    return {
      voiceId: voice.id,
      ...style,
      distributionPlatforms,
      constraints: {
        ...constraints,
        taboos: mergeTaboosWithGlobal(constraints.taboos),
      },
      persona: voice.persona.trim() || undefined,
    };
  }

  if (voice.persona.trim()) {
    return {
      voiceId: voice.id,
      ...style,
      distributionPlatforms,
      persona: voice.persona.trim(),
    };
  }

  return { distributionPlatforms };
}
