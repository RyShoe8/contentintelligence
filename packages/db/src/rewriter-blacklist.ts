/** Common AI / affiliate marketing phrases to detect and avoid in ReWriter output. */
export const REWRITER_AI_PHRASE_BLACKLIST = [
  "don't miss out",
  "do not miss out",
  "maximize your fun",
  "exciting opportunity",
  "join today",
  "act now",
  "elevate your experience",
  "unlock rewards",
  "time is running out",
  "limited time offer",
  "game-changing",
  "revolutionary",
  "in today's fast-paced world",
  "look no further",
  "dive in",
  "without further ado",
  "at the end of the day",
  "it's worth noting",
  "in conclusion",
  "leverage",
  "synergy",
  "cutting-edge",
  "best-in-class",
  "take your experience to the next level",
  "don't wait",
  "sign up now",
  "claim now",
  "hurry",
  "exclusive offer",
  "once-in-a-lifetime",
] as const;

export function findRewriterBlacklistMatches(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const phrase of REWRITER_AI_PHRASE_BLACKLIST) {
    if (lower.includes(phrase)) hits.push(phrase);
  }
  return hits;
}

export function rewriterBlacklistPromptBlock(): string {
  return REWRITER_AI_PHRASE_BLACKLIST.slice(0, 20)
    .map((p) => `- "${p}"`)
    .join("\n");
}
