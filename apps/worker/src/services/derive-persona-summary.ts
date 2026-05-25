import type { BrandProfile } from "@content-resourcer/db";
import {
  brandMentionLevelLabel,
  buildBrandMentionPromptLine,
  formatPhraseGroup,
  GLOBAL_VOICE_TABOOS,
  type VoicePreferredPhraseLike,
} from "../voice-style-rules.js";

export type PersonaVoiceOpts = {
  brandMentionLevel?: number;
  preferredPhrases?: VoicePreferredPhraseLike[];
};

export function derivePersonaSummary(
  profile: BrandProfile,
  voiceName: string,
  voiceOpts?: PersonaVoiceOpts,
): string {
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
    ...(voiceOpts ? voiceSettingsSections(voiceName, voiceOpts) : []),
  ].filter((x): x is string => Boolean(x));

  return lines.join("\n");
}

function voiceSettingsSections(voiceName: string, opts: PersonaVoiceOpts): string[] {
  const level = Math.max(0, Math.min(100, Math.round(opts.brandMentionLevel ?? 50)));
  const mentionLine = buildBrandMentionPromptLine(voiceName, level);

  const brandMention = [
    "",
    "## Brand mention frequency",
    `- Setting: ${level} (${brandMentionLevelLabel(level)})`,
    mentionLine,
  ].filter((x): x is string => Boolean(x));

  const pairs = (opts.preferredPhrases ?? [])
    .map((p) => {
      const phrases =
        p.phrases?.map((x) => x.trim()).filter(Boolean) ??
        (typeof (p as { phrase?: string }).phrase === "string"
          ? [(p as { phrase?: string }).phrase!.trim()]
          : []);
      if (!phrases.length) return null;
      const group = formatPhraseGroup(phrases);
      const freq = Math.max(0, Math.min(100, Math.round(p.frequency_level ?? 50)));
      const label = brandMentionLevelLabel(freq);
      const url = p.url?.trim();
      const varNote = p.allow_ai_variations ? ", AI variations allowed" : ", exact wording only";
      const suffix = ` (${label}, ${freq}${varNote})`;
      return url?.startsWith("https://")
        ? `- ${group}|${url}${suffix}`
        : `- ${group}${suffix}`;
    })
    .filter((x): x is string => Boolean(x));

  const preferredPhrases = [
    "",
    "## Preferred phrases for posts",
    "- Use at most one phrase+link pair when natural (do not force every post)",
    ...(pairs.length ? pairs : ["- None configured"]),
  ];

  return [...brandMention, ...preferredPhrases];
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
