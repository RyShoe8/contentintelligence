const voiceGenerateInFlight = new Map<string, Promise<void>>();

export function isVoicePersonaGenerateInFlight(voiceId: string): boolean {
  return voiceGenerateInFlight.has(voiceId);
}

/** Run persona generation for one voice; rejects if that voice already has a job in flight. */
export function runVoicePersonaGenerateExclusive(
  voiceId: string,
  fn: () => Promise<void>,
): Promise<void> {
  if (voiceGenerateInFlight.has(voiceId)) {
    return Promise.reject(new Error("voice_generate_already_running"));
  }
  const job = fn().finally(() => {
    voiceGenerateInFlight.delete(voiceId);
  });
  voiceGenerateInFlight.set(voiceId, job);
  return job;
}

/** Test helper */
export function clearVoicePersonaGenerateInFlight(): void {
  voiceGenerateInFlight.clear();
}
