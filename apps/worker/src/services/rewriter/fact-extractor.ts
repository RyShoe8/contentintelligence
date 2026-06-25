import {
  contentFactsSchema,
  narrativeSectionSchema,
  proceduralSectionSchema,
  type ContentFacts,
  type FaqItem,
  type NarrativeSection,
  type ProceduralSection,
} from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";
import { isComposeHowToTopic } from "./compose-topic-mode.js";

export type ExtractContentFactsOpts = {
  preserveInstructions?: boolean;
  composeMode?: boolean;
  includeFaq?: boolean;
  topic?: string;
  subtopics?: string[];
};

const FAQ_SECTION_TITLE_RE = /^(faq|frequently asked questions)/i;

function filterFaqNarrativeSections(sections: NarrativeSection[]): NarrativeSection[] {
  return sections.filter((s) => !FAQ_SECTION_TITLE_RE.test(s.title.trim()));
}

export { filterFaqNarrativeSections };

function buildComposeExtractSystemPrompt(includeFaq?: boolean): string {
  const faqRules = includeFaq
    ? `- faqItems: array of {"question": string, "answer": string} from FAQ content in the brief. Preserve facts; answers will be rewritten in brand voice.
- Do NOT put FAQ in keyDetails.`
    : `- Omit faqItems entirely. Do not extract FAQ or Q&A content.`;

  return `Extract structured facts from an editorial research brief as JSON only.
Schema:
{"contentType":"hybrid","keyDetails":string[],"faqItems"?:{"question":string,"answer":string}[]}
Rules:
- keyDetails: 12–24 atomic factual statements with source URLs when present. Flat pool — no section grouping.
- Include angles, caveats, and open questions as individual keyDetails — do NOT create narrativeSections or brief section labels.
- Do NOT output narrativeSections.
${faqRules}
- Omit promotional tone and brand/community commentary.`;
}

function parseFaqItems(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return [];
  const items: FaqItem[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item == null) continue;
    const q = "question" in item ? String((item as { question: unknown }).question).trim() : "";
    const a = "answer" in item ? String((item as { answer: unknown }).answer).trim() : "";
    if (q && a) items.push({ question: q, answer: a });
  }
  return items;
}

function parseFaqFromBriefSections(sections: NarrativeSection[]): {
  faqItems: FaqItem[];
  remaining: NarrativeSection[];
} {
  const faqItems: FaqItem[] = [];
  const remaining: NarrativeSection[] = [];
  for (const section of sections) {
    if (FAQ_SECTION_TITLE_RE.test(section.title.trim())) {
      for (const point of section.points) {
        const qaMatch = point.match(/^Q:\s*(.+?\?)\s*A:\s*(.+)$/is);
        if (qaMatch) {
          faqItems.push({
            question: qaMatch[1]!.trim(),
            answer: qaMatch[2]!.trim(),
          });
        }
      }
    } else {
      remaining.push(section);
    }
  }
  return { faqItems, remaining };
}

export function flattenBriefToKeyDetails(brief: string, includeFaq?: boolean): ContentFacts {
  let sections = parseBriefSectionsByHeaders(brief);
  let faqItems: FaqItem[] = [];
  if (includeFaq) {
    const parsed = parseFaqFromBriefSections(sections);
    faqItems = parsed.faqItems;
    sections = parsed.remaining;
  } else {
    sections = filterFaqNarrativeSections(sections);
  }
  const keyDetails = sections.flatMap((s) => s.points).filter(Boolean).slice(0, 24);
  if (keyDetails.length === 0 && brief.trim()) {
    keyDetails.push(brief.trim().slice(0, 2000));
  }
  return contentFactsSchema.parse({
    contentType: "hybrid",
    keyDetails,
    ...(faqItems.length ? { faqItems } : {}),
  });
}

async function extractComposeResearchFacts(
  trimmed: string,
  includeFaq?: boolean,
): Promise<ContentFacts> {
  const raw = await completeJson<unknown>({
    system: buildComposeExtractSystemPrompt(includeFaq),
    user: trimmed,
    temperature: 0.15,
    maxTokens: HYBRID_EXTRACT_MAX_TOKENS,
  });

  const parsed = parseContentFacts(raw);
  const faqItems = includeFaq
    ? parseFaqItems(raw && typeof raw === "object" && "faqItems" in raw ? (raw as { faqItems?: unknown }).faqItems : parsed?.faqItems)
    : [];

  const keyDetails = parsed?.keyDetails?.length
    ? parsed.keyDetails
    : [];

  if (keyDetails.length >= 3) {
    return contentFactsSchema.parse({
      contentType: "hybrid",
      keyDetails,
      ...(faqItems.length ? { faqItems } : {}),
    });
  }

  return flattenBriefToKeyDetails(trimmed, includeFaq);
}

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

function buildHybridProceduralExtractSystemPrompt(topic?: string, subtopics?: string[]): string {
  const topicBlock = topic?.trim() ? `\nArticle topic: ${topic.trim()}` : "";
  const subtopicBlock = subtopics?.length
    ? `\nRequired subtopics (ensure procedural sections cover each):\n${subtopics.map((s) => `- ${s}`).join("\n")}`
    : "";
  return `Extract structured content from a hybrid article or how-to research brief as JSON only.
Schema:
{"contentType":"hybrid","narrativeSections":[{"title":string,"points":string[]}],"sections":[{"title":string,"steps":string[]}],"keyDetails":string[]}
Rules:
- narrativeSections: editorial blocks (intro themes, why it matters, troubleshooting, best practices, FAQ Q+A as points, closing). One object per major heading.
- sections: procedural how-to blocks only. One object per version/platform/topic (e.g. Apple Mail, Outlook for Windows).
- steps: ordered actions with menu paths (Mail > Preferences), button names, file types, and settings preserved verbatim where possible.
- points: key ideas to cover in each narrative block (not verbatim copy).
- Do NOT merge platforms into one procedural flow.
- Do NOT drop editorial blocks because they are not steps.
- Do NOT collapse FAQ into a single bullet.
- keyDetails: 4–12 short topic summary bullets for the whole article.
- Section titles must reflect the stated topic and subtopics — not generic category labels (e.g. prefer "Apple Mail" over "Email clients").${topicBlock}${subtopicBlock}
- Omit promotional tone.`;
}

async function extractHybridProceduralFacts(
  trimmed: string,
  topic?: string,
  subtopics?: string[],
): Promise<ContentFacts | null> {
  const raw = await completeJson<unknown>({
    system: buildHybridProceduralExtractSystemPrompt(topic, subtopics),
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

  if (proceduralSections.length === 0 && narrativeSections.length === 0) {
    return null;
  }

  const contentType = resolvePreserveContentType(narrativeSections, proceduralSections);
  return contentFactsSchema.parse({
    ...parsed,
    contentType,
    narrativeSections: narrativeSections.length ? narrativeSections : undefined,
    sections: proceduralSections.length ? proceduralSections : undefined,
    keyDetails: parsed?.keyDetails ?? [],
  });
}

export async function extractContentFacts(
  sourceText: string,
  opts: ExtractContentFactsOpts = {},
): Promise<ContentFacts> {
  const trimmed = sourceText.trim();

  if (opts.composeMode) {
    if (opts.topic && isComposeHowToTopic(opts.topic, opts.subtopics)) {
      const hybrid = await extractHybridProceduralFacts(trimmed, opts.topic, opts.subtopics);
      if (hybrid) return hybrid;
    }
    return extractComposeResearchFacts(trimmed, opts.includeFaq);
  }

  if (opts.preserveInstructions) {
    const hybrid = await extractHybridProceduralFacts(trimmed);
    if (hybrid) return hybrid;
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
