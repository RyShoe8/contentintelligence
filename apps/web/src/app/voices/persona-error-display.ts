export const FIXED_RHYTHM_SAMPLE_PERSONA_MESSAGE =
  "Persona generation failed due to a style-example data issue that has been fixed. Click Regenerate persona below.";

export function isFixedRhythmSamplePersonaError(raw?: string | null): boolean {
  if (!raw?.trim()) return false;
  if (/compose_style_kit.*rhythmSample|rhythmSample.*received null/i.test(raw)) return true;
  return raw.includes('"rhythmSample"') && raw.includes('"invalid_type"');
}

export function formatPersonaErrorForDisplay(raw?: string | null): string {
  if (!raw?.trim()) return "";
  if (isFixedRhythmSamplePersonaError(raw)) return FIXED_RHYTHM_SAMPLE_PERSONA_MESSAGE;

  if (raw.trimStart().startsWith('[{"code":')) {
    try {
      const issues = JSON.parse(raw) as Array<{
        path?: (string | number)[];
        message?: string;
      }>;
      const first = issues[0];
      if (first) {
        const path = Array.isArray(first.path) ? first.path.join(".") : "";
        const msg = first.message ?? "Validation failed";
        return path ? `${path}: ${msg}` : msg;
      }
    } catch {
      // fall through to raw string
    }
  }

  return raw;
}
