import type { BrandProfile } from "@content-resourcer/db";
import { GLOBAL_VOICE_TABOOS } from "../voice-style-rules.js";

export function derivePersonaSummary(profile: BrandProfile, voiceName: string): string {
  const lines = [
    `# ${voiceName} voice`,
    "",
    "## Voice summary",
    profile.positioning.primary ||
      `${voiceName} promotional voice shaped by linked content and historical posts.`,
    profile.positioning.secondary ? `Secondary positioning: ${profile.positioning.secondary}` : null,
    "",
    "## Tone & personality",
    `- Audience relationship: ${profile.audienceRelationship.style || "trusted advisor"}`,
    `- Emotional baseline: ${profile.emotionalBaseline.primary || "confident urgency"}`,
    `- Primary trait: ${profile.contradictions.primaryTrait || "analytical"}`,
    `- Secondary trait: ${profile.contradictions.secondaryTrait || "accessible"}`,
    "",
    "## Sounds like / does not sound like",
    profile.contrastive.soundsLike.length
      ? `- Sounds like: ${profile.contrastive.soundsLike.join("; ")}`
      : null,
    profile.contrastive.doesNotSoundLike.length
      ? `- Does NOT sound like: ${profile.contrastive.doesNotSoundLike.join("; ")}`
      : null,
    "",
    "## Rhetorical patterns",
    ...(profile.rhetoricalPatterns.length
      ? profile.rhetoricalPatterns.map((p) => `- ${p}`)
      : ["- Lead with deal hook", "- Keep sentences short"]),
    "",
    "## Taboos",
    ...tabooLines(profile.taboos),
    "",
    "## Content objectives",
    profile.contentObjectives.length
      ? profile.contentObjectives.map((o) => `- ${o}`).join("\n")
      : "- engagement\n- conversion",
    "",
    "## Brand memory markers",
    profile.memory.favoritePhrases.length
      ? `Favorite phrases: ${profile.memory.favoritePhrases.join("; ")}`
      : null,
    profile.memory.recurringTopics.length
      ? `Recurring topics: ${profile.memory.recurringTopics.join("; ")}`
      : null,
    profile.memory.recurringEnemies.length
      ? `Recurring enemies: ${profile.memory.recurringEnemies.join("; ")}`
      : null,
  ].filter((x): x is string => Boolean(x));

  return lines.join("\n");
}

function tabooLines(taboos: string[]): string[] {
  const merged = [...taboos];
  for (const t of GLOBAL_VOICE_TABOOS) {
    if (!merged.some((x) => x.toLowerCase() === t.toLowerCase())) {
      merged.push(t);
    }
  }
  if (!merged.length) {
    return ["- Avoid generic AI phrasing", "- Avoid corporate jargon"];
  }
  return merged.map((t) => `- ${t}`);
}
