import { completeJson } from "../llm/json-completion.js";

export { isComposeHowToTopic } from "@content-resourcer/db";

/** Broad guideline topics that should use manifesto-style outlines, not field surveys. */
export function isGuidelinesManifestoTopic(topic: string): boolean {
  return /\b(guidelines?|principles|standards|best practices|design guide)\b/i.test(topic.trim());
}

const LENS_MAX_WORDS = 8;

/** Pick one tangible object/space/process from research facts to carry a broad topic. */
export async function pickConcreteLens(
  topic: string,
  keyDetails: string[],
): Promise<string | undefined> {
  if (!isGuidelinesManifestoTopic(topic) || !keyDetails.length) return undefined;

  try {
    const raw = await completeJson<{ lens?: string | null }>({
      system: `Pick ONE tangible object, space, or process that can carry an entire editorial article about a broad topic. JSON only:
{"lens": string | null}
Rules:
- The lens must be concrete and physical (a chair, a corridor, a dining room, a lighting plan) — not an abstract theme (wellness, community, safety).
- It must appear in or be strongly implied by the research facts.
- Return null if no single concrete lens fits the facts.
- Keep it short (under ${LENS_MAX_WORDS} words).`,
      user: [
        `Topic: ${topic.trim()}`,
        "",
        "Research facts:",
        ...keyDetails.slice(0, 20).map((d) => `- ${d}`),
      ].join("\n"),
      temperature: 0.3,
      maxTokens: 100,
    });

    const lens = raw?.lens?.trim();
    if (!lens) return undefined;
    const words = lens.split(/\s+/).filter(Boolean).length;
    return words >= 1 && words <= LENS_MAX_WORDS ? lens : undefined;
  } catch {
    return undefined;
  }
}
