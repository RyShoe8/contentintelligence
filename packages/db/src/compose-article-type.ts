import { z } from "zod";

export const composeArticleTypeSchema = z.enum(["editorial", "how_to"]);
export type ComposeArticleType = z.infer<typeof composeArticleTypeSchema>;

const HOW_TO_TOPIC_RE =
  /\b(how to|how-to|setup|set up|set-up|configure|configuration|install|enable|create|add|implement(?:ing)?)\b/i;

const PROCEDURAL_SUBTOPIC_RE =
  /\b(html file|\.html|step[- ]by[- ]step|apple mail|outlook|gmail|settings|menu|preferences|signature file|import|upload)\b/i;

/** Tutorial-style compose topics that need procedural steps, not editorial fact pools. */
export function isComposeHowToTopic(topic: string, subtopics?: string[]): boolean {
  const trimmed = topic.trim();
  if (trimmed && HOW_TO_TOPIC_RE.test(trimmed)) return true;
  for (const sub of subtopics ?? []) {
    const s = sub.trim();
    if (!s) continue;
    if (HOW_TO_TOPIC_RE.test(s) || PROCEDURAL_SUBTOPIC_RE.test(s)) return true;
  }
  return false;
}

export function resolveComposeArticleType(
  explicit: ComposeArticleType | undefined,
  topic: string,
  subtopics?: string[],
): ComposeArticleType {
  if (explicit) return explicit;
  return isComposeHowToTopic(topic, subtopics) ? "how_to" : "editorial";
}
