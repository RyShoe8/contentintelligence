import type { FaqItem } from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";
import type { ArticleRewriteExample } from "./types.js";
import { extractHeadingsFromExampleHtml } from "./compose-style-excerpt.js";

export type ComposeOutlineSection = {
  heading: string;
  factSummary: string;
};

export type ComposeOutline = {
  title?: string;
  sections: ComposeOutlineSection[];
};

export function extractStyleExampleHeadings(examples: ArticleRewriteExample[]): string[] {
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

function fallbackOutline(
  topic: string,
  subtopics: string[],
  keyDetails: string[],
): ComposeOutline {
  const sections: ComposeOutlineSection[] = [];
  if (subtopics.length) {
    for (const sub of subtopics.slice(0, 6)) {
      sections.push({ heading: sub.trim(), factSummary: "Cover relevant research facts" });
    }
  } else {
    const chunk = Math.max(1, Math.ceil(keyDetails.length / 4));
    for (let i = 0; i < Math.min(4, keyDetails.length); i += chunk) {
      const slice = keyDetails.slice(i, i + chunk);
      sections.push({
        heading: i === 0 ? topic.trim() : `More on ${topic.trim()}`,
        factSummary: slice.slice(0, 3).join("; "),
      });
    }
  }
  if (!sections.length) {
    sections.push({ heading: topic.trim(), factSummary: "Cover all research facts in brand voice" });
  }
  return { sections };
}

export async function planComposeOutline(opts: {
  topic: string;
  subtopics?: string[];
  keyDetails: string[];
  faqItems?: FaqItem[];
  styleHeadings: string[];
}): Promise<ComposeOutline> {
  const topic = opts.topic.trim();
  if (!topic) {
    return fallbackOutline("", opts.subtopics ?? [], opts.keyDetails);
  }

  const factSample = opts.keyDetails.slice(0, 12);
  const styleHeadingBlock =
    opts.styleHeadings.length > 0
      ? opts.styleHeadings.map((h) => `- ${h}`).join("\n")
      : "(no style headings available)";

  try {
    const raw = await completeJson<{
      title?: string;
      sections?: { heading?: string; factSummary?: string }[];
    }>({
      system: `Plan an editorial article outline in JSON only.
Reply: {"title": string?, "sections": [{"heading": string, "factSummary": string}]}
Rules:
- Headings must sound like editorial chapter titles from the brand style examples — NOT research brief labels (Topic overview, Key facts, Angles, Caveats, FAQ).
- Do NOT use generic survey headings like "What X Looks Like" or "Understanding Y" unless the style examples use that pattern.
- Assign each section a factSummary describing which research facts to weave in (short phrase, not full bullets).
- 4–7 sections typical. Match rhythm of style example headings when possible.`,
      user: [
        `Topic: ${topic}`,
        opts.subtopics?.length
          ? `Required subtopics (each needs a section):\n${opts.subtopics.map((s) => `- ${s}`).join("\n")}`
          : "",
        `Research facts (pool — assign across sections, do not mirror brief structure):\n${factSample.map((f) => `- ${f}`).join("\n")}`,
        `Style example headings (imitate tone and shape, not wording):\n${styleHeadingBlock}`,
        "",
        "Write the outline JSON.",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.35,
      maxTokens: 1200,
    });

    const sections = (raw?.sections ?? [])
      .map((s) => ({
        heading: s.heading?.trim() ?? "",
        factSummary: s.factSummary?.trim() ?? "",
      }))
      .filter((s) => s.heading.length > 0);

    if (sections.length >= 2) {
      return {
        title: raw?.title?.trim() || undefined,
        sections,
      };
    }
  } catch {
    // fall through to deterministic outline
  }

  return fallbackOutline(topic, opts.subtopics ?? [], opts.keyDetails);
}

export function formatComposeOutlineForPrompt(outline: ComposeOutline): string {
  return `\n\nEditorial outline (follow this structure — weave facts into each section; do NOT add research-brief section headings):\n${JSON.stringify(outline, null, 2)}`;
}
