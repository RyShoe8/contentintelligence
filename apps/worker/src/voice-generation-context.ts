import type { GenerationConstraints, SocialPlatformId, Voice } from "@content-resourcer/db";
import { assembleGenerationConstraints } from "./services/constraints/assemble-generation-constraints.js";
import { deriveWriterPersonaSummary } from "./services/derive-persona-summary.js";
import {
  mergeTaboosWithGlobal,
  type VoicePreferredPhraseLike,
} from "./voice-style-rules.js";

export type VoiceGenerationContext = {
  voiceId?: string;
  brandName?: string;
  brandMentionLevel?: number;
  sourcesInPostsLevel?: number;
  preferredPhrases?: VoicePreferredPhraseLike[];
  persona?: string;
  constraints?: GenerationConstraints;
  distributionPlatforms?: SocialPlatformId[];
};

function voiceStyleFields(voice: Voice) {
  return {
    brandName: voice.name,
    brandMentionLevel: voice.brand_mention_level ?? 50,
    sourcesInPostsLevel: voice.sources_in_posts_level ?? 0,
    preferredPhrases: voice.preferred_phrases ?? [],
  };
}

/** Compose-ready persona — excludes social/deal and visual sections. */
export function resolveWriterPersonaForCompose(voice: Voice): string | undefined {
  if (voice.persona_status !== "ready") return undefined;
  if (voice.brand_profile) {
    return deriveWriterPersonaSummary(voice.brand_profile, voice.name);
  }
  const stored = voice.persona?.trim();
  if (!stored) return undefined;
  if (/Content provider names in posts|casino|Preferred phrases for posts/i.test(stored)) {
    return undefined;
  }
  return stored;
}

export function resolveVoiceGenerationContext(voice: Voice | null): VoiceGenerationContext {
  if (!voice || voice.persona_status !== "ready") {
    return {};
  }

  const style = voiceStyleFields(voice);

  const distributionPlatforms = voice.distribution_platforms ?? [];
  const writerPersona = resolveWriterPersonaForCompose(voice);

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
      persona: writerPersona,
    };
  }

  if (writerPersona) {
    return {
      voiceId: voice.id,
      ...style,
      distributionPlatforms,
      persona: writerPersona,
    };
  }

  return { voiceId: voice.id, ...style, distributionPlatforms };
}
