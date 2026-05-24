import type { Db } from "mongodb";
import {
  getContentSignal,
  getVoice,
  updateVoicePersonaStatus,
} from "@content-resourcer/db";
import { generateVoicePersona } from "./generate-voice-persona.js";
import { buildVoiceResearchCorpus } from "./voice-research.js";

export async function runVoicePersonaGeneration(db: Db, voiceId: string): Promise<void> {
  const voice = await getVoice(db, voiceId);
  if (!voice) {
    throw new Error("voice_not_found");
  }

  await updateVoicePersonaStatus(db, voiceId, {
    persona_status: "pending",
    persona_error: undefined,
  });

  try {
    const linkedSignals = [];
    for (const signalId of voice.content_signal_ids) {
      const cs = await getContentSignal(db, signalId);
      if (cs) linkedSignals.push(cs);
    }

    const researchCorpus = await buildVoiceResearchCorpus(voice);
    const persona = await generateVoicePersona({ voice, researchCorpus, linkedSignals });

    await updateVoicePersonaStatus(db, voiceId, {
      persona,
      persona_status: "ready",
      persona_generated_at: new Date(),
      persona_error: undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updateVoicePersonaStatus(db, voiceId, {
      persona_status: "failed",
      persona_error: message,
    });
    throw e;
  }
}
