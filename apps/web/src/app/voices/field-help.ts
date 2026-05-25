export const VOICE_FIELD_TIPS = {
  brand_mention_level:
    "How often generated post copy mentions this voice's name. Included in the generated persona template and enforced when building Posts.",
  sources_in_posts_level:
    "How often generated post copy names the content provider from each email (e.g. Chipnwin), shown above the post title. Not the voice brand or Gmail inbox label (Email · Promotions). Refresh posts after saving.",
  persona_generation:
    "Persona generation usually takes 1–3 minutes. A progress indicator appears while it runs.",
  keywords:
    "One keyword per line, or comma-separated. Up to 5. Short tone or brand traits (e.g. playful, urgent, trusted) — used when generating the persona, not for Gmail feed filtering.",
  preferred_phrases:
    "Each row is one optional https link with comma-separated phrases (synonyms). Use the AI variations toggle to allow close paraphrases of those terms in posts, or leave off for exact wording. At most one phrase group is used per post; higher-frequency rows are preferred. Included in the generated persona template.",
} as const;
