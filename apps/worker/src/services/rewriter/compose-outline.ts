import type { ComposeArticleArchetype, FaqItem } from "@content-resourcer/db";
import { writerComposeVoiceStyleIssues } from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";
import { extractHeadingsFromExampleHtml } from "./compose-style-excerpt.js";
import {
  DEFAULT_COMPOSE_ARTICLE_ARCHETYPE,
  resolveComposeArticleArchetype,
} from "./compose-article-archetype.js";
import { isGuidelinesManifestoTopic } from "./compose-topic-mode.js";
import type { ArticleRewriteExample } from "./types.js";

export type ComposeOutlineSection = {
  heading: string;
  factSummary: string;
};

export type ComposeOutline = {
  title?: string;
  sections: ComposeOutlineSection[];
};

/** Procedural outline for how-to compose from extracted facts (no LLM). */
export function buildComposeHowToOutline(opts: {
  topic: string;
  facts: { sections?: { title: string; steps: string[] }[]; narrativeSections?: { title: string; points: string[] }[] };
  subtopics?: string[];
}): ComposeOutline | undefined {
  const proceduralSections = opts.facts.sections ?? [];
  const narrativeSections = opts.facts.narrativeSections ?? [];
  if (proceduralSections.length || narrativeSections.length) {
    return {
      title: opts.topic.trim(),
      sections: [
        ...narrativeSections.map((section) => ({
          heading: section.title,
          factSummary: section.points.slice(0, 4).join("; ") || "Cover key ideas in brand voice",
        })),
        ...proceduralSections.map((section) => ({
          heading: section.title,
          factSummary: section.steps.slice(0, 4).join("; ") || "Ordered setup steps",
        })),
      ],
    };
  }
  if (opts.subtopics?.length) {
    return {
      title: opts.topic.trim(),
      sections: opts.subtopics.map((subtopic) => ({
        heading: subtopic,
        factSummary: "Ordered setup steps for this subtopic",
      })),
    };
  }
  return undefined;
}

function archetypeHeadingRoles(archetype: ComposeArticleArchetype): string[] {
  return archetype.sampleHeadings.slice(0, archetype.sectionCount);
}

function maxSectionsForArchetype(archetype: ComposeArticleArchetype, includeFaq?: boolean): number {
  const extra = includeFaq ? 1 : 0;
  return archetype.sectionCount + extra;
}

function outlineHasTextbookHeadings(outline: ComposeOutline): string[] {
  const fakeHtml = outline.sections.map((s) => `<h2>${s.heading}</h2>`).join("");
  return writerComposeVoiceStyleIssues(fakeHtml);
}

function outlineExceedsArchetype(
  outline: ComposeOutline,
  archetype: ComposeArticleArchetype,
  includeFaq?: boolean,
): boolean {
  return outline.sections.length > maxSectionsForArchetype(archetype, includeFaq);
}

function subtopicsUsedAsHeadings(outline: ComposeOutline, subtopics: string[]): boolean {
  if (!subtopics.length) return false;
  const headings = outline.sections.map((s) => s.heading.toLowerCase().trim());
  return subtopics.some((sub) => {
    const normalized = sub.trim().toLowerCase();
    return headings.some((h) => h === normalized || h.includes(normalized) || normalized.includes(h));
  });
}

function fallbackOutline(
  topic: string,
  keyDetails: string[],
  archetype: ComposeArticleArchetype,
): ComposeOutline {
  const roles = archetypeHeadingRoles(archetype);
  const sectionCount = archetype.sectionCount;
  const chunk = Math.max(1, Math.ceil(keyDetails.length / sectionCount));
  const sections: ComposeOutlineSection[] = [];

  for (let i = 0; i < sectionCount; i++) {
    const role = roles[i] ?? `Editorial section ${i + 1}`;
    const slice = keyDetails.slice(i * chunk, i * chunk + chunk);
    sections.push({
      heading: i === 0 ? topic.trim() || role : role,
      factSummary:
        slice.length > 0
          ? slice.slice(0, 4).join("; ")
          : "Weave relevant research facts in brand voice",
    });
  }

  if (!sections.length) {
    sections.push({
      heading: topic.trim() || "Editorial opening",
      factSummary: "Cover research facts in a single editorial thread",
    });
  }

  return { sections };
}

const FAQ_QUESTION_ROLE_RE = /\b(?:question|ask|hear)\b/i;
const FAQ_CONVICTION_ROLE_RE = /\b(?:reject|look for)\b/i;

/** Editorial FAQ H2 role from primary archetype headings — question-ish roles first. */
export function faqHeadingRole(archetype: ComposeArticleArchetype): string {
  const questionRole = [...archetype.sampleHeadings]
    .reverse()
    .find((h) => FAQ_QUESTION_ROLE_RE.test(h));
  if (questionRole) return questionRole;
  const convictionRole = [...archetype.sampleHeadings]
    .reverse()
    .find((h) => FAQ_CONVICTION_ROLE_RE.test(h));
  if (convictionRole) return convictionRole;
  const last = archetype.sampleHeadings[archetype.sampleHeadings.length - 1];
  return last?.trim() || "Closing stance";
}

/** Force single-threaded manifesto shape for broad guideline topics. */
export function applyManifestoArchetypeOverride(
  archetype: ComposeArticleArchetype,
  topic: string,
): ComposeArticleArchetype {
  if (!isGuidelinesManifestoTopic(topic)) return archetype;
  return {
    ...archetype,
    singleThreaded: true,
    sectionCount: Math.min(archetype.sectionCount, 4),
  };
}

function manifestoOutlineRules(topic: string): string {
  if (!isGuidelinesManifestoTopic(topic)) return "";
  return `
- Guidelines manifesto mode: one editorial thesis thread (test → reject → apply, or match reference heading roles).
- Weave broad research as supporting evidence inside sections — NOT parallel subtopic or community-type H2s.
- Forbid field-survey headings even if the research brief suggests them.`;
}

function faqOutlineRules(archetype: ComposeArticleArchetype, includeFaq?: boolean): string {
  if (!includeFaq) return "";
  const role = faqHeadingRole(archetype);
  return `
- Closing FAQ section (+1 beyond main sections) must use an editorial H2 adapted from: "${role}" — adapt the wording so the title makes sense over Q&A items; NOT a question-mark title ("Curious About…", "Got Questions").`;
}

const REJECTION_ROLE_HEADING_RE = /\b(?:reject|never|won'?t|stand against)\b/i;
const REJECTION_FACT_RE = /\b(?:reject|never|won'?t|avoid|refuse|rule out|don'?t)\b/i;

/** Rejection-role headings must be assigned rejection-type facts. */
export function outlineRejectionRoleIssues(outline: ComposeOutline): string[] {
  const issues: string[] = [];
  for (const section of outline.sections) {
    if (!REJECTION_ROLE_HEADING_RE.test(section.heading)) continue;
    if (!REJECTION_FACT_RE.test(section.factSummary)) {
      issues.push(
        `Rejection-role section "${section.heading}" must be assigned facts about what we reject/avoid — reassign facts or rename the heading`,
      );
    }
  }
  return issues.slice(0, 2);
}

function concreteLensRule(lens?: string): string {
  if (!lens?.trim()) return "";
  return `
- Anchor the article through this concrete lens: ${lens.trim()}. Open with it, return to it, use it to make abstract guidelines tangible.`;
}

export function buildOutlineSystemPrompt(
  archetype: ComposeArticleArchetype,
  opts?: { includeFaq?: boolean; topic?: string; concreteLens?: string },
): string {
  const includeFaq = opts?.includeFaq;
  const topic = opts?.topic?.trim() ?? "";
  const roles = archetypeHeadingRoles(archetype);
  const maxSections = maxSectionsForArchetype(archetype, includeFaq);
  return `Plan an editorial article outline in JSON only.
Reply: {"title": string?, "sections": [{"heading": string, "factSummary": string}]}
Rules:
- Plan exactly ${archetype.sectionCount} main sections (max ${maxSections} if FAQ closing section is required).
- Match the structural roles of these reference headings — topic-adapted wording, do NOT copy verbatim:
${roles.map((h, i) => `  ${i + 1}. ${h}`).join("\n")}
- Single editorial thread${archetype.singleThreaded ? " — NOT a typology survey" : ""}.
- Do NOT create one section per research subtopic or brief bucket, and do not write a parallel tour of product/service categories unless the brand's own reference headings use that shape.
- Headings must sound like editorial chapter titles — NOT research brief labels (Topic overview, Key facts, Angles, Caveats, FAQ).
- Do NOT use generic survey headings ("Understanding the…", "Innovative Trends", "Nature's Embrace", "Looking Ahead").
- Assign each section a factSummary describing which research facts to weave in (short phrase, not full bullets).
- Subtopics and user angles are fact pools — weave into sections, not as H2 titles.${manifestoOutlineRules(topic)}${concreteLensRule(opts?.concreteLens)}${faqOutlineRules(archetype, includeFaq)}`;
}

export async function planComposeOutline(opts: {
  topic: string;
  subtopics?: string[];
  keyDetails: string[];
  faqItems?: FaqItem[];
  includeFaq?: boolean;
  archetype?: ComposeArticleArchetype;
  examples?: ArticleRewriteExample[];
  concreteLens?: string;
}): Promise<ComposeOutline> {
  const topic = opts.topic.trim();
  const baseArchetype =
    opts.archetype ??
    (opts.examples?.length ? resolveComposeArticleArchetype(opts.examples) : DEFAULT_COMPOSE_ARTICLE_ARCHETYPE);
  const archetype = applyManifestoArchetypeOverride(baseArchetype, topic);

  if (!topic) {
    return fallbackOutline("", opts.keyDetails, archetype);
  }

  const factSample = opts.keyDetails.slice(0, 16);
  const subtopicBlock = opts.subtopics?.length
    ? `Subtopics to weave as facts (NOT as section titles):\n${opts.subtopics.map((s) => `- ${s}`).join("\n")}`
    : "";

  const tryPlan = async (retryIssues: string[]): Promise<ComposeOutline | null> => {
    const retryBlock =
      retryIssues.length > 0
        ? `\nFix these outline issues:\n${retryIssues.map((i) => `- ${i}`).join("\n")}`
        : "";

    const raw = await completeJson<{
      title?: string;
      sections?: { heading?: string; factSummary?: string }[];
    }>({
      system: `${buildOutlineSystemPrompt(archetype, { includeFaq: opts.includeFaq, topic, concreteLens: opts.concreteLens })}${retryBlock}`,
      user: [
        `Topic: ${topic}`,
        subtopicBlock,
        opts.includeFaq && opts.faqItems?.length
          ? `Include FAQ facts in a closing section when needed (${opts.faqItems.length} Q/A pairs).`
          : "",
        `Research facts (pool — assign across sections, do not mirror brief structure):\n${factSample.map((f) => `- ${f}`).join("\n")}`,
        archetype.openingPattern
          ? `Opening pattern from brand example (match rhythm, do not copy): ${archetype.openingPattern}`
          : "",
        "",
        "Write the outline JSON.",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.35,
      maxTokens: 1200,
      tier: "research",
    });

    const sections = (raw?.sections ?? [])
      .map((s) => ({
        heading: s.heading?.trim() ?? "",
        factSummary: s.factSummary?.trim() ?? "",
      }))
      .filter((s) => s.heading.length > 0);

    if (sections.length < 2) return null;

    const outline: ComposeOutline = {
      title: raw?.title?.trim() || undefined,
      sections,
    };

    const issues: string[] = [];
    if (outlineExceedsArchetype(outline, archetype, opts.includeFaq)) {
      issues.push(
        `Too many sections (${outline.sections.length}) — plan exactly ${archetype.sectionCount} main sections`,
      );
    }
    if (subtopicsUsedAsHeadings(outline, opts.subtopics ?? [])) {
      issues.push("Subtopics appear as section headings — weave subtopics as facts inside sections instead");
    }
    issues.push(...outlineRejectionRoleIssues(outline));
    issues.push(...outlineHasTextbookHeadings(outline));

    if (issues.length) {
      if (retryIssues.length > 0) return null;
      const retry = await tryPlan(issues.slice(0, 4));
      return retry;
    }

    return outline;
  };

  try {
    const planned = await tryPlan([]);
    if (planned) return planned;
  } catch {
    // fall through to deterministic outline
  }

  return fallbackOutline(topic, opts.keyDetails, archetype);
}

export function formatComposeOutlineForPrompt(outline: ComposeOutline): string {
  return `\n\nEditorial outline (follow this structure and section count — weave facts into each section; do NOT add research-brief section headings or extra survey sections):\n${JSON.stringify(outline, null, 2)}`;
}

export function extractStyleExampleHeadings(examples: ArticleRewriteExample[]): string[] {
  const primaryArchetype = examples.length ? resolveComposeArticleArchetype(examples) : undefined;
  if (primaryArchetype?.sampleHeadings.length) {
    return primaryArchetype.sampleHeadings.slice(0, 12);
  }
  const headings: string[] = [];
  for (const ex of examples) {
    for (const h of extractHeadingsFromExampleHtml(ex.html)) {
      if (!headings.some((existing) => existing.toLowerCase() === h.toLowerCase())) {
        headings.push(h);
      }
    }
  }
  return headings.slice(0, 12);
}
