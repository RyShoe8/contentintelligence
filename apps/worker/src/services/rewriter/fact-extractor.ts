import {
  contentFactsSchema,
  narrativeSectionSchema,
  proceduralSectionSchema,
  type ContentFacts,
  type NarrativeSection,
  type ProceduralSection,
} from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";

export type ExtractContentFactsOpts = {
  preserveInstructions?: boolean;
  composeMode?: boolean;
};

const HYBRID_EXTRACT_MAX_TOKENS = 6000;
const COMPOSE_BRIEF_HEADER_RE =
  /^(topic overview|key facts|angles to cover|angles|caveats|faq|open questions|weak evidence)/i;

export function parseBriefSectionsByHeaders(brief: string): NarrativeSection[] {
  const lines = brief.split(/\r?\n/);
  const sections: NarrativeSection[] = [];
  let currentTitle = "Topic overview";
  let currentPoints: string[] = [];

  function flush() {
    const points = currentPoints.map((p) => p.trim()).filter(Boolean);
    if (points.length) sections.push({ title: currentTitle, points });
    currentPoints = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const headerMatch = trimmed.match(/^([A-Za-z][^:]{2,80}):\s*$/);
    if (headerMatch && COMPOSE_BRIEF_HEADER_RE.test(headerMatch[1] ?? "")) {
      flush();
      currentTitle = headerMatch[1]!.trim();
      continue;
    }
    const numbered = trimmed.match(/^\d+\.\s+(.+)/);
    if (numbered) {
      currentPoints.push(numbered[1]!);
      continue;
    }
    if (trimmed.startsWith("- ")) {
      currentPoints.push(trimmed.slice(2));
      continue;
    }
    currentPoints.push(trimmed);
  }
  flush();
  return sections;
}

async function extractComposeResearchFacts(trimmed: string): Promise<ContentFacts> {
  const raw = await completeJson<unknown>({
    system: `Extract structured facts from an editorial research brief as JSON only.
Schema:
{"contentType":"hybrid","narrativeSections":[{"title":string,"points":string[]}],"keyDetails":string[]}
Rules:
- narrativeSections: one object per labeled brief section (Topic overview, Key facts, Angles to cover, Caveats and counterpoints, FAQ ideas, Open questions and weak evidence). Skip empty sections.
- points: preserve factual bullets with source URLs/citations where present in the brief.
- keyDetails: 8–20 atomic factual statements with source URLs when available.
- Do NOT drop angles, caveats, FAQ, or open questions.
- Omit promotional tone and brand/community commentary.`,
    user: trimmed,
    temperature: 0.15,
    maxTokens: HYBRID_EXTRACT_MAX_TOKENS,
  });

  const parsed = parseContentFacts(raw);
  const narrativeSections = parseNarrativeSections(
    raw && typeof raw === "object" && "narrativeSections" in raw
      ? (raw as { narrativeSections?: unknown }).narrativeSections
      : parsed?.narrativeSections,
  );

  if (narrativeSections.length > 0) {
    return contentFactsSchema.parse({
      contentType: "hybrid",
      narrativeSections,
      keyDetails: parsed?.keyDetails?.length ? parsed.keyDetails : [],
    });
  }

  const fallbackSections = parseBriefSectionsByHeaders(trimmed);
  if (fallbackSections.length > 0) {
    return contentFactsSchema.parse({
      contentType: "hybrid",
      narrativeSections: fallbackSections,
      keyDetails: fallbackSections.flatMap((s) => s.points).slice(0, 20),
    });
  }

  return contentFactsSchema.parse({
    contentType: "hybrid",
    narrativeSections: [{ title: "Research brief", points: [trimmed.slice(0, 2000)] }],
    keyDetails: trimmed.length > 400 ? [trimmed.slice(0, 400)] : [trimmed],
  });
}

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

function parseNarrativeSections(raw: unknown): NarrativeSection[] {
  if (!Array.isArray(raw)) return [];
  const sections: NarrativeSection[] = [];
  for (const item of raw) {
    const parsed = narrativeSectionSchema.safeParse(item);
    if (parsed.success) sections.push(parsed.data);
  }
  return sections;
}

function resolvePreserveContentType(
  narrativeSections: NarrativeSection[],
  proceduralSections: ProceduralSection[],
): ContentFacts["contentType"] {
  if (narrativeSections.length > 0 && proceduralSections.length > 0) return "hybrid";
  if (proceduralSections.length > 0) return "procedural";
  return "general";
}

export async function extractContentFacts(
  sourceText: string,
  opts: ExtractContentFactsOpts = {},
): Promise<ContentFacts> {
  const trimmed = sourceText.trim();

  if (opts.composeMode) {
    return extractComposeResearchFacts(trimmed);
  }

  if (opts.preserveInstructions) {
    const raw = await completeJson<unknown>({
      system: `Extract structured content from a hybrid article as JSON only.
Schema:
{"contentType":"hybrid","narrativeSections":[{"title":string,"points":string[]}],"sections":[{"title":string,"steps":string[]}],"keyDetails":string[]}
Rules:
- narrativeSections: editorial blocks (intro themes, why it matters, checklists, HTML/troubleshooting, best practices, FAQ Q+A as points, closing). One object per major heading.
- sections: procedural how-to blocks only. One object per version/platform/topic (e.g. Outlook for Windows, Outlook on the web).
- steps: ordered actions with menu paths (File > Options > Mail), button names, and settings preserved verbatim where possible.
- points: key ideas to cover in each narrative block (not verbatim copy).
- Do NOT merge platforms into one procedural flow.
- Do NOT drop editorial blocks because they are not steps.
- Do NOT collapse FAQ into a single bullet.
- keyDetails: 4–12 short topic summary bullets for the whole article.
- Omit promotional tone.`,
      user: trimmed,
      temperature: 0.15,
      maxTokens: HYBRID_EXTRACT_MAX_TOKENS,
    });

    const parsed = parseContentFacts(raw);
    const proceduralSections = parseProceduralSections(
      raw && typeof raw === "object" && "sections" in raw
        ? (raw as { sections?: unknown }).sections
        : parsed?.sections,
    );
    const narrativeSections = parseNarrativeSections(
      raw && typeof raw === "object" && "narrativeSections" in raw
        ? (raw as { narrativeSections?: unknown }).narrativeSections
        : parsed?.narrativeSections,
    );

    if (proceduralSections.length > 0 || narrativeSections.length > 0) {
      const contentType = resolvePreserveContentType(narrativeSections, proceduralSections);
      return contentFactsSchema.parse({
        ...parsed,
        contentType,
        narrativeSections: narrativeSections.length ? narrativeSections : undefined,
        sections: proceduralSections.length ? proceduralSections : undefined,
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
