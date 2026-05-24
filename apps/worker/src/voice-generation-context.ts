import type { GenerationConstraints, Voice } from "@content-resourcer/db";
import { assembleGenerationConstraints } from "./services/constraints/assemble-generation-constraints.js";
import { mergeTaboosWithGlobal, type VoiceSocialLinkLike } from "./voice-style-rules.js";

export type VoiceGenerationContext = {
  voiceId?: string;
  brandName?: string;
  preferredPhrases?: string[];
  preferredLinks?: VoiceSocialLinkLike[];
  persona?: string;
  constraints?: GenerationConstraints;
};

function voiceStyleFields(voice: Voice) {
  return {
    brandName: voice.name,
    preferredPhrases: voice.preferred_phrases ?? [],
    preferredLinks: voice.preferred_links ?? [],
  };
}

export function resolveVoiceGenerationContext(voice: Voice | null): VoiceGenerationContext {
  if (!voice || voice.persona_status !== "ready") {
    return {};
  }

  const style = voiceStyleFields(voice);

  if (voice.brand_profile) {
    const constraints = assembleGenerationConstraints(voice.brand_profile);
    return {
      voiceId: voice.id,
      ...style,
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
      persona: voice.persona.trim(),
    };
  }

  return {};
}
