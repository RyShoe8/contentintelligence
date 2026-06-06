import {
  contentFactsSchema,
  proceduralSectionSchema,
  type ContentFacts,
  type ProceduralSection,
} from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";

export type ExtractContentFactsOpts = {
  preserveInstructions?: boolean;
};

export function parseContentFacts(raw: unknown): ContentFacts | null {
  const parsed = contentFactsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseProceduralSections(raw: unknown): ProceduralSection[] {
  if (!Array.isArray(raw)) return [];
  const sections: ProceduralSection[] = [];
  for (const item of raw) {
    const parsed = proceduralSectionSchema.safeParse(item);
    if (parsed.success) sections.push(parsed.data);
  }
  return sections;
}

export async function extractContentFacts(
  sourceText: string,
  opts: ExtractContentFactsOpts = {},
): Promise<ContentFacts> {
  const trimmed = sourceText.trim();

  if (opts.preserveInstructions) {
    const raw = await completeJson<unknown>({
      system: `Extract structured procedural instructions from the input as JSON only.
Schema:
{"contentType":"procedural","sections":[{"title":string,"steps":string[]}],"keyDetails":string[]}
Rules:
- contentType must be "procedural".
- sections: one object per version/platform/topic heading in the source (e.g. Outlook 2016, Outlook on the web).
- steps: ordered list of actions for that section. Preserve menu paths (File > Options > Mail), button names, and settings verbatim where possible.
- Do NOT merge sections. Do NOT collapse multiple versions into one generic flow.
- Do NOT summarize steps into vague bullets.
- keyDetails: optional 2–6 short summary bullets for context only.
- Omit promotional tone.`,
      user: trimmed,
      temperature: 0.15,
      maxTokens: 4096,
    });

    const parsed = parseContentFacts(raw);
    const sections = parseProceduralSections(
      raw && typeof raw === "object" && "sections" in raw
        ? (raw as { sections?: unknown }).sections
        : parsed?.sections,
    );

    if (sections.length > 0) {
      return contentFactsSchema.parse({
        ...parsed,
        contentType: "procedural",
        sections,
        keyDetails: parsed?.keyDetails ?? [],
      });
    }
  }

  const raw = await completeJson<unknown>({
    system: `Extract structured facts from the input as JSON only. Do not preserve marketing tone or phrasing.
Schema:
{"offer": string|null,"depositAmount": string|null,"bonusAmount": string|null,"casino": string|null,"expiration": string|null,"sourceUrl": string|null,"contentType":"general","keyDetails": string[]}
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
