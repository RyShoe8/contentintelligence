import type { Db } from "mongodb";
import {
  getVoice,
  updateVoiceBrandProfile,
  updateVoicePersonaStatus,
} from "@content-resourcer/db";
import { analyzeBrandProfile } from "./jobs/analyze-brand-profile.js";

export async function runVoicePersonaGeneration(
  db: Db,
  voiceId: string,
  options?: { forceRebuild?: boolean },
): Promise<void> {
  const voice = await getVoice(db, voiceId);
  if (!voice) {
    throw new Error("voice_not_found");
  }

  await updateVoicePersonaStatus(db, voiceId, {
    persona_status: "pending",
    persona_error: undefined,
  });

  try {
    const { profile, persona, corpusHash, cached } = await analyzeBrandProfile(db, voice, {
      forceRebuild: options?.forceRebuild,
    });
    const nextVersion = cached
      ? (voice.brand_profile_version ?? 0)
      : (voice.brand_profile_version ?? 0) + 1;

    await updateVoiceBrandProfile(db, voiceId, {
      brand_profile: profile,
      corpus_hash: corpusHash,
      brand_profile_version: nextVersion,
      persona,
      persona_status: "ready",
      persona_generated_at: new Date(),
      persona_error: undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await updateVoicePersonaStatus(db, voiceId, {
        persona_status: "failed",
        persona_error: message,
      });
    } catch {
      // swallow secondary mongo errors
    }
    throw e;
  }
}
