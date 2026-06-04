/** Persona generation is considered stalled after this many ms without ready/failed. */
export const PERSONA_STALE_MS = 12 * 60 * 1000;

export type PersonaPollVoiceFields = {
  persona_status: string;
  persona_requested_at?: Date | string | null;
  updated_at?: Date | string | null;
};

function toTimestamp(raw: Date | string | null | undefined): number | null {
  if (raw == null) return null;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

/** When the current generate/retry was kicked off (not set on save-only pending voices). */
export function personaGenerationStartedAt(voice: PersonaPollVoiceFields): number | null {
  return toTimestamp(voice.persona_requested_at);
}

export function isPersonaPendingStale(
  voice: PersonaPollVoiceFields,
  nowMs: number = Date.now(),
): boolean {
  if (voice.persona_status !== "pending") return false;
  const started = personaGenerationStartedAt(voice);
  if (started != null) return nowMs - started > PERSONA_STALE_MS;
  const updated = toTimestamp(voice.updated_at);
  if (updated == null) return false;
  return nowMs - updated > PERSONA_STALE_MS;
}

/**
 * Whether the UI should poll persona-status and show the generating spinner.
 */
export function shouldPollPersona(
  voice: PersonaPollVoiceFields,
  generatingParam?: string,
): boolean {
  if (voice.persona_status !== "pending") return false;
  if (generatingParam === "1") return true;
  const started = personaGenerationStartedAt(voice);
  if (started == null) return false;
  return Date.now() - started <= PERSONA_STALE_MS;
}
