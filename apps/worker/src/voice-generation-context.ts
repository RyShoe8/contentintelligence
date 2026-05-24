import type { GenerationConstraints, Voice } from "@content-resourcer/db";
import { assembleGenerationConstraints } from "./services/constraints/assemble-generation-constraints.js";

export type VoiceGenerationContext = {
  voiceId?: string;
  persona?: string;
  constraints?: GenerationConstraints;
};

export function resolveVoiceGenerationContext(voice: Voice | null): VoiceGenerationContext {
  if (!voice || voice.persona_status !== "ready") {
    return {};
  }

  if (voice.brand_profile) {
    return {
      voiceId: voice.id,
      constraints: assembleGenerationConstraints(voice.brand_profile),
      persona: voice.persona.trim() || undefined,
    };
  }

  if (voice.persona.trim()) {
    return { voiceId: voice.id, persona: voice.persona.trim() };
  }

  return {};
}
