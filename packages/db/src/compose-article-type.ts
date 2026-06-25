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

/** Editorial deep-research brief section labels that should not appear in how-to briefs. */
export const COMPOSE_EDITORIAL_BRIEF_HEADER_RE =
  /^(topic overview|key facts|angles to cover|angles|caveats and counterpoints)$/i;

/** How-to research brief section labels. */
export const COMPOSE_HOW_TO_BRIEF_HEADER_RE =
  /^(setup steps|per-platform|per-platform\/subtopic procedures|troubleshooting)$/i;

function briefSectionHeaders(brief: string): string[] {
  const headers: string[] = [];
  for (const line of brief.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z][^:]{2,80}):\s*$/);
    if (match?.[1]) headers.push(match[1].trim());
  }
  return headers;
}

/** True when the brief uses editorial research structure (Topic overview, Angles to cover, etc.). */
export function hasEditorialResearchBriefHeaders(brief: string): boolean {
  return briefSectionHeaders(brief).some((h) => COMPOSE_EDITORIAL_BRIEF_HEADER_RE.test(h));
}

/** True when the brief uses how-to procedural structure. */
export function hasHowToResearchBriefHeaders(brief: string): boolean {
  return briefSectionHeaders(brief).some((h) => COMPOSE_HOW_TO_BRIEF_HEADER_RE.test(h));
}
