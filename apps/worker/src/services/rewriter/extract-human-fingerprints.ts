import { humanFingerprintsPatchSchema, type HumanFingerprintsPatch } from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";

export function parseHumanFingerprintsPatch(raw: unknown): HumanFingerprintsPatch | null {
  const parsed = humanFingerprintsPatchSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function extractHumanFingerprintsFromHtml(
  html: string,
): Promise<HumanFingerprintsPatch> {
  const trimmed = html.trim();
  if (!trimmed) return {};

  const raw = await completeJson<unknown>({
    system: `Extract recurring human writing patterns from brand content as JSON only:
{"favoriteOpenings": string[],"favoriteClosings": string[],"favoriteTransitions": string[],"recurringOpinions": string[],"recurringWarnings": string[]}
Rules:
- Each array: 0–5 short phrases actually present or strongly implied in the text.
- Openings/closings: sentence starters or sign-offs, not full paragraphs.
- Opinions/warnings: viewpoint lines the author repeats.
- Empty arrays when none found.`,
    user: trimmed.slice(0, 12000),
    temperature: 0.2,
    maxTokens: 700,
  });

  return parseHumanFingerprintsPatch(raw) ?? {};
}
