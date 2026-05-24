export type VoiceSocialLinkLike = { label?: string; url: string };

export type VoiceStylePromptOpts = {
  brandName?: string;
  preferredPhrases?: string[];
  preferredLinks?: VoiceSocialLinkLike[];
};

export const GLOBAL_VOICE_TABOOS = [
  "No emojis",
  "No em dash or en dash punctuation (use commas or periods instead)",
] as const;

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu;

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

  if (opts.brandName?.trim()) {
    lines.push(
      `- Mention the brand name "${opts.brandName.trim()}" at least once when it fits naturally`,
    );
  }

  const phrases = (opts.preferredPhrases ?? []).map((p) => p.trim()).filter(Boolean);
  if (phrases.length) {
    lines.push(
      `- Optionally weave in at most one of these preferred phrases when natural (do not force all): ${phrases.join("; ")}`,
    );
  }

  const links = (opts.preferredLinks ?? []).filter((l) => l.url?.trim());
  if (links.length) {
    lines.push(
      `- When a URL belongs in the post, use at most one from the approved links list in the user message (do not invent other URLs)`,
    );
  }

  return lines;
}

export function formatPreferredLinksForUserMessage(links: VoiceSocialLinkLike[]): string {
  const formatted = links
    .filter((l) => l.url?.trim())
    .map((l) => (l.label?.trim() ? `${l.label.trim()}|${l.url.trim()}` : l.url.trim()));
  if (!formatted.length) return "";
  return `Approved links (use at most one when a URL fits): ${formatted.join("; ")}`;
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
