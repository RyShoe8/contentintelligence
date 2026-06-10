/** Broad guideline topics that should use manifesto-style outlines, not field surveys. */
export function isGuidelinesManifestoTopic(topic: string): boolean {
  return /\b(guidelines?|principles|standards|best practices|design guide)\b/i.test(topic.trim());
}
