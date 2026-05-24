export const VOICE_FIELD_TIPS = {
  brand_mention_level:
    "How often generated post copy mentions this voice's name. Included in the generated persona template and enforced when building Posts.",
  persona_generation:
    "Persona generation usually takes 1–3 minutes. A progress indicator appears while it runs.",
  keywords:
    "One keyword per line, or comma-separated. Up to 5. Short tone or brand traits (e.g. playful, urgent, trusted) — used when generating the persona, not for Gmail feed filtering.",
  preferred_phrases:
    "Each phrase can include an optional https link and its own frequency slider (Never to Always). At most one phrase is used per post; higher-frequency phrases are preferred. Included in the generated persona template.",
} as const;
