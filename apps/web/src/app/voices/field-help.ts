export const VOICE_FIELD_TIPS = {
  brand_mention_level:
    "How often generated post copy mentions this voice's name. Enforced when building Posts — not part of the Writer persona below.",
  sources_in_posts_level:
    "How often generated post copy names the content provider from each email (e.g. Chipnwin), shown above the post title. Not the voice brand or Gmail inbox label (Email · Promotions). Refresh posts after saving.",
  persona:
    "Writer and editorial voice for articles. Social post settings (brand mention, content provider names, preferred phrases) are controlled by the sliders and phrase rows below — they are not stored in this persona text.",
  persona_generation:
    "Persona generation usually takes 1–3 minutes. A progress indicator appears while it runs.",
  keywords:
    "One keyword per line, or comma-separated. Up to 5. Short tone or brand traits (e.g. playful, urgent, trusted). Shapes persona generation and Writer style when the voice writes an article — not used during Writer research.",
  preferred_phrases:
    "Each row is one optional https link with comma-separated phrases (synonyms). Use the AI variations toggle to allow close paraphrases of those terms in posts, or leave off for exact wording. At most one phrase group is used per post; higher-frequency rows are preferred. Enforced when building Posts — not part of the Writer persona.",
  style_examples:
    "Articles imported from your RSS feed. Used for Writer style at write time and persona research. Remove any you do not want included.",
} as const;
