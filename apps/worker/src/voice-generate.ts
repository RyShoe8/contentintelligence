import type { Db } from "mongodb";
import {
  getVoice,
  updateVoiceBrandProfile,
  updateVoicePersonaStatus,
} from "@content-resourcer/db";
import { analyzeBrandProfile } from "./jobs/analyze-brand-profile.js";
import { ingestVoiceRssStyleExamplesAndRecordSync } from "./jobs/ingest-voice-rss-style-examples.js";
import { formatJobErrorMessage } from "./format-job-error.js";

export const PERSONA_GENERATION_TIMEOUT_MS = 12 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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
    await ingestVoiceRssStyleExamplesAndRecordSync(db, voice);
    const voiceForAnalysis = (await getVoice(db, voiceId)) ?? voice;

    const { profile, persona, corpusHash, cached, composeVoiceProfile } = await withTimeout(
      analyzeBrandProfile(db, voiceForAnalysis, {
        forceRebuild: options?.forceRebuild,
      }),
      PERSONA_GENERATION_TIMEOUT_MS,
      "persona_generation_timeout",
    );
    const nextVersion = cached
      ? (voiceForAnalysis.brand_profile_version ?? 0)
      : (voiceForAnalysis.brand_profile_version ?? 0) + 1;

    await updateVoiceBrandProfile(db, voiceId, {
      brand_profile: profile,
      corpus_hash: corpusHash,
      brand_profile_version: nextVersion,
      persona,
      persona_status: "ready",
      persona_generated_at: new Date(),
      persona_error: undefined,
      compose_voice_profile: composeVoiceProfile,
    });
  } catch (e) {
    const message = formatJobErrorMessage(e);
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
