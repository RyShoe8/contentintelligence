import { contentFactsSchema, type ContentFacts } from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";

export function parseContentFacts(raw: unknown): ContentFacts | null {
  const parsed = contentFactsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function extractContentFacts(sourceText: string): Promise<ContentFacts> {
  const trimmed = sourceText.trim();
  const raw = await completeJson<unknown>({
    system: `Extract structured facts from the input as JSON only. Do not preserve marketing tone or phrasing.
Schema:
{"offer": string|null,"depositAmount": string|null,"bonusAmount": string|null,"casino": string|null,"expiration": string|null,"sourceUrl": string|null,"keyDetails": string[]}
Rules:
- keyDetails: atomic factual statements only (4–16 when present). One fact per string.
- Omit promotional adjectives. Use neutral wording.
- Use null for unknown optional fields.
- Do not copy slogans or urgency language into keyDetails.`,
    user: trimmed,
    temperature: 0.2,
    maxTokens: 1200,
  });

  const parsed = parseContentFacts(raw);
  if (parsed) return parsed;

  return contentFactsSchema.parse({
    keyDetails: trimmed.length > 400 ? [trimmed.slice(0, 400)] : [trimmed],
  });
}
