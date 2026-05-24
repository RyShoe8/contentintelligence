export type VoicePreferredPhraseLike = { phrase: string; url?: string };

export type VoiceStylePromptOpts = {
  brandName?: string;
  brandMentionLevel?: number;
  preferredPhrases?: VoicePreferredPhraseLike[];
};

export const GLOBAL_VOICE_TABOOS = [
  "No emojis",
  "No em dash or en dash punctuation (use commas or periods instead)",
] as const;

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu;

export function brandMentionLevelLabel(level: number): string {
  const l = Math.max(0, Math.min(100, Math.round(level)));
  if (l === 0) return "Never";
  if (l <= 25) return "Rare";
  if (l <= 50) return "Sometimes";
  if (l <= 75) return "Often";
  return "Always";
}

export function buildBrandMentionPromptLine(brandName: string, level: number): string | null {
  const name = brandName.trim();
  if (!name) return null;

  const l = Math.max(0, Math.min(100, Math.round(level)));
  if (l === 0) {
    return `- Do not mention the brand name "${name}" unless it already appears in the input email`;
  }
  if (l <= 25) {
    return `- Mention "${name}" rarely, only when clearly relevant`;
  }
  if (l <= 50) {
    return `- Mention "${name}" at least once when it fits naturally`;
  }
  if (l <= 75) {
    return `- Mention "${name}" prominently; include it at least once and again in the CTA or closing line when space allows`;
  }
  return `- Always lead with "${name}" and mention the brand at least twice when the post has room`;
}

export function mergeTaboosWithGlobal(taboos: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...taboos, ...GLOBAL_VOICE_TABOOS]) {
    const s = t.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 15) break;
  }
  return out;
}

export function buildVoiceStylePromptLines(opts: VoiceStylePromptOpts): string[] {
  const lines: string[] = [...GLOBAL_VOICE_TABOOS.map((t) => `- ${t}`)];

  const brandLine = buildBrandMentionPromptLine(
    opts.brandName ?? "",
    opts.brandMentionLevel ?? 50,
  );
  if (brandLine) lines.push(brandLine);

  const pairs = (opts.preferredPhrases ?? [])
    .map((p) => ({ phrase: p.phrase?.trim() ?? "", url: p.url?.trim() }))
    .filter((p) => p.phrase);
  if (pairs.length) {
    lines.push(
      `- Optionally use at most one preferred phrase+link pair from the user message when natural (do not force all)`,
    );
    lines.push(
      `- When you use a phrase that has a paired URL, include that URL; do not invent other URLs`,
    );
  }

  return lines;
}

export function formatPreferredPhrasesForUserMessage(
  phrases: VoicePreferredPhraseLike[],
): string {
  const formatted = phrases
    .map((p) => {
      const phrase = p.phrase?.trim();
      if (!phrase) return "";
      const url = p.url?.trim();
      return url?.startsWith("https://") ? `${phrase}|${url}` : phrase;
    })
    .filter(Boolean);
  if (!formatted.length) return "";
  return `Preferred phrase pairs (use at most one when natural): ${formatted.join("; ")}`;
}

/** Strip emojis and em/en dashes; leave ASCII hyphen untouched. */
export function sanitizeVoicePostCopy(text: string): string {
  return text
    .replace(EMOJI_RE, "")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/  +/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();
}
