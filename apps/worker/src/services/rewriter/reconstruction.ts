import {
  formatWriterLinksForPrompt,
  isHybridContentFacts,
  rewriterBlacklistPromptBlock,
  writerArticleDepthGuidance,
  type BrandInterpretation,
  type BrandMemory,
  type ComposeArticleArchetype,
  type ContentFacts,
  type WriterLink,
} from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import OpenAI from "openai";
import { formatConstraintsForPrompt } from "../constraints/assemble-generation-constraints.js";
import { env } from "../../env.js";
import type { VoiceGenerationContext } from "../../voice-generation-context.js";
import {
  buildVoiceStylePromptLines,
  type VoiceStylePromptOpts,
} from "../../voice-style-rules.js";
import {
  COMPOSE_SBD_RHETORIC_RULES,
  COMPOSE_VOICE_RULES,
  composeFaqPromptRules,
  composeRhythmPromptRules,
} from "./compose-voice-rules.js";
import { resolvePrimaryKitRhythm } from "./compose-article-archetype.js";
import { buildRichExampleExcerpt } from "./compose-style-excerpt.js";
import {
  faqHeadingRole,
  formatComposeOutlineForPrompt,
  type ComposeOutline,
} from "./compose-outline.js";
import { isGuidelinesManifestoTopic } from "./compose-topic-mode.js";
import type { ArticleRewriteExample } from "./types.js";

const EXAMPLE_EXCERPT_CHARS = 1500;
const COMPOSE_EXAMPLE_EXCERPT_CHARS = 7000;

function fingerprintsBlock(memory?: BrandMemory): string {
  if (!memory) return "";
  const parts: string[] = [];
  if (memory.favoriteOpenings?.length) {
    parts.push(`Openings this brand uses: ${memory.favoriteOpenings.slice(0, 5).join(" | ")}`);
  }
  if (memory.favoriteClosings?.length) {
    parts.push(`Closings this brand uses: ${memory.favoriteClosings.slice(0, 5).join(" | ")}`);
  }
  if (memory.favoriteTransitions?.length) {
    parts.push(`Transitions: ${memory.favoriteTransitions.slice(0, 5).join(" | ")}`);
  }
  if (memory.recurringOpinions?.length) {
    parts.push(`Recurring opinions: ${memory.recurringOpinions.slice(0, 5).join(" | ")}`);
  }
  if (memory.recurringWarnings?.length) {
    parts.push(`Recurring warnings: ${memory.recurringWarnings.slice(0, 5).join(" | ")}`);
  }
  return parts.length ? `\nHuman fingerprints (use naturally when they fit):\n${parts.join("\n")}` : "";
}

function hasProceduralSections(facts: ContentFacts): boolean {
  return (
    (facts.contentType === "procedural" || facts.contentType === "hybrid") &&
    (facts.sections?.length ?? 0) > 0
  );
}

function proceduralRulesBlock(facts: ContentFacts): string {
  if (!hasProceduralSections(facts)) return "";
  return `
Procedural instructions (strict):
- Render EVERY procedural section as its own <h2> or <h3> using the section title.
- Render EVERY step as an ordered <ol><li> list under its section. Preserve step order.
- Do NOT merge version-specific sections into one generic flow.
- Rephrase for brand voice without omitting steps, menu paths, or settings names.`;
}

function hasNarrativeSections(facts: ContentFacts): boolean {
  return (facts.narrativeSections?.length ?? 0) > 0;
}

function isComposeFactPool(facts: ContentFacts, composeMode?: boolean): boolean {
  return composeMode === true && facts.keyDetails.length > 0;
}

function hybridRulesBlock(
  facts: ContentFacts,
  composeMode?: boolean,
  subtopics?: string[],
): string {
  if (composeMode && hasProceduralSections(facts)) {
    const subtopicsBlock = subtopics?.length
      ? `\nRequired subtopics (each needs its own section or clear subsection with ordered steps):\n${subtopics.map((s) => `- ${s}`).join("\n")}`
      : "";
    return `
Compose how-to article (tutorial in brand voice — not a generic industry guide):
- Render EVERY procedural section with its title as <h2> or <h3> and steps as ordered <ol><li>.
- Cover the article subject and every required subtopic with platform-specific steps from the facts.
- Do NOT generalize to "email clients", "best practices", or survey-style headings unless those exact ideas are in the facts.
- Preserve menu paths, button names, file types, and settings from the facts.
- Short intro/outro in brand voice is fine; the body must be step-by-step.${subtopicsBlock}${COMPOSE_VOICE_RULES}${COMPOSE_SBD_RHETORIC_RULES}`;
  }
  if (composeMode && (hasNarrativeSections(facts) || isComposeFactPool(facts, composeMode))) {
    return `
Compose article (author-first editorial voice — not a research summary):
- Facts are a pool in keyDetails — weave them into editorial sections; do NOT mirror research brief structure.
- Do NOT use research-brief section titles as headings (Topic overview, Key facts, Angles to cover, Caveats, Open questions, FAQ).
- Do NOT default to topical survey headings (e.g. "What Active Adult Living Looks Like", "Memory Care: A Focus on…") unless the editorial outline specifies them.
- Write editorial <h2>/<h3> headings matching brand examples and the editorial outline below.
- Weave facts into flowing prose in full brand voice — not a labeled brief or bullet dump.
- Include procedural sections with full ordered steps when present (see procedural rules above).
- Do not add filler closings like "What are your thoughts?"
- No duplicate H2 topics; no meta "open questions remain" endings.${COMPOSE_VOICE_RULES}${COMPOSE_SBD_RHETORIC_RULES}`;
  }
  if (!isHybridContentFacts(facts)) return "";
  return `
Hybrid article (full article, not a cheat sheet):
- Include EVERY narrativeSections block as <h2> or <h3> plus <p> and/or <ul><li> rewritten in brand voice from points.
- Include EVERY procedural sections block with full ordered steps (see procedural rules above).
- Section order is flexible for readability, but do NOT omit any narrative or procedural block.
- Do not add a standalone promo closing unless required links need placement; weave links into relevant narrative sections.
- Do not add filler closings like "What are your thoughts?"`;
}

function formatNarrativeSectionsForPrompt(facts: ContentFacts): string {
  if (!facts.narrativeSections?.length) return "";
  return `\n\nNarrative sections (include ALL key points):\n${JSON.stringify(facts.narrativeSections, null, 2)}`;
}

function formatSectionsForPrompt(facts: ContentFacts): string {
  if (!hasProceduralSections(facts) || !facts.sections?.length) return "";
  return `\n\nProcedural sections (include ALL steps):\n${JSON.stringify(facts.sections, null, 2)}`;
}

const BRAND_DETAILS_MAX = 12;

/** Aggregated verbatim brand facts from style example kits. */
export function formatBrandDetailsForPrompt(examples: ArticleRewriteExample[]): string {
  const details: string[] = [];
  for (const ex of examples) {
    for (const d of ex.composeStyleKit?.concreteDetails ?? []) {
      if (!details.some((existing) => existing.toLowerCase() === d.toLowerCase())) {
        details.push(d);
      }
    }
  }
  if (!details.length) return "";
  const lines = details.slice(0, BRAND_DETAILS_MAX).map((d) => `- ${d}`);
  return `\n\nBrand concrete details (weave 3–6 naturally where relevant; copy facts faithfully; NEVER invent new statistics, names, or places):\n${lines.join("\n")}`;
}

function formatExamplesForPrompt(examples: ArticleRewriteExample[], composeMode?: boolean): string {
  if (!examples.length) return "";
  const excerptChars = composeMode ? COMPOSE_EXAMPLE_EXCERPT_CHARS : EXAMPLE_EXCERPT_CHARS;
  const selected = composeMode ? examples : examples.slice(0, 5);
  const blocks = selected.map((ex, i) => {
    const body = composeMode
      ? buildRichExampleExcerpt(ex.html, excerptChars, ex.composeStyleKit)
      : ex.html.length > excerptChars
        ? `${ex.html.slice(0, excerptChars)}…`
        : ex.html;
    return `### Example ${i + 1} (do not copy title or chrome): ${ex.title}\n${body}`;
  });
  const composeNote = composeMode
    ? " Imitate heading style, paragraph length, sentence rhythm, openings/closings, and rhetorical patterns from these examples — never copy titles, dates, navigation, or share buttons. Facts come from research; prose and structure come from these examples plus persona and the editorial outline — not from the research brief."
    : "";
  return `\n\nBrand examples (match voice and rhythm, not content):${composeNote}\n${blocks.join("\n\n")}`;
}

export type ReconstructArticleOpts = {
  voice: Voice;
  ctx: VoiceGenerationContext;
  facts: ContentFacts;
  interpretation: BrandInterpretation;
  examples: ArticleRewriteExample[];
  links: WriterLink[];
  retryIssues?: string[];
  attempt?: number;
  articleDepth?: number;
  subtopics?: string[];
  exactLinkLabels?: boolean;
  composeMode?: boolean;
  topic?: string;
  includeFaq?: boolean;
  composeOutline?: ComposeOutline;
  composeArchetype?: ComposeArticleArchetype;
  concreteLens?: string;
};

export function buildReconstructionSystemPrompt(opts: ReconstructArticleOpts): string {
  const style: VoiceStylePromptOpts = {
    brandName: opts.ctx.brandName,
    brandMentionLevel: opts.ctx.brandMentionLevel,
    contentProviderName: undefined,
    sourcesInPostsLevel: opts.ctx.sourcesInPostsLevel,
    preferredPhrases: opts.ctx.preferredPhrases,
  };
  const styleLines = buildVoiceStylePromptLines(style);
  const personaBlock = opts.ctx.persona?.trim()
    ? `\nBrand persona:\n${opts.ctx.persona.trim()}`
    : "";
  const constraintsBlock = opts.ctx.constraints
    ? `\nBrand constraints (JSON):\n${formatConstraintsForPrompt(opts.ctx.constraints)}`
    : "";
  const memory = opts.voice.brand_profile?.memory;
  const depthBlock =
    opts.articleDepth != null
      ? `\nArticle length:\n${writerArticleDepthGuidance(opts.articleDepth).reconstructionPrompt}`
      : "";
  const subtopicsBlock =
    opts.composeMode && hasProceduralSections(opts.facts) && opts.subtopics?.length
      ? `\nRequired subtopics (each needs its own section or clear subsection with ordered steps):\n${opts.subtopics.map((s) => `- ${s}`).join("\n")}`
      : opts.composeMode && opts.subtopics?.length
        ? `\nResearch subtopics (weave as facts inside editorial sections — do NOT use as H2/H3 headings):\n${opts.subtopics.map((s) => `- ${s}`).join("\n")}`
        : !opts.composeMode && opts.subtopics?.length
          ? `\nRequired subtopics (cover each with its own H2 or H3 section):\n${opts.subtopics.map((s) => `- ${s}`).join("\n")}`
          : "";

  const faqRole = opts.composeArchetype ? faqHeadingRole(opts.composeArchetype) : undefined;
  const faqBlock = opts.composeMode ? composeFaqPromptRules(opts.includeFaq, faqRole) : "";

  const topic = opts.topic?.trim();
  const manifestoBlock =
    opts.composeMode && topic && isGuidelinesManifestoTopic(topic)
      ? "\nWrite as an operator manifesto on what we test, reject, and specify — not a neutral industry design guide."
      : "";
  const openingBlock =
    opts.composeMode && opts.composeArchetype?.openingPattern?.trim()
      ? `\nOpening requirement: first or second paragraph must adapt this operator conviction (rhythm only, do not copy verbatim): ${opts.composeArchetype.openingPattern.trim()}`
      : "";
  const rhythmBlock = opts.composeMode
    ? composeRhythmPromptRules(resolvePrimaryKitRhythm(opts.examples))
    : "";
  const lensBlock =
    opts.composeMode && opts.concreteLens?.trim()
      ? `\nConcrete lens: anchor the article through "${opts.concreteLens.trim()}" — open with it, return to it, use it to make abstract guidelines tangible.`
      : "";
  const composeTopicBlock =
    opts.composeMode && topic
      ? hasProceduralSections(opts.facts)
        ? `\nArticle subject: ${topic}
Write a how-to tutorial ABOUT this topic in full brand voice.
Stay specific to the platforms, apps, files, and steps in the facts — do not drift into generic "${topic.split(/\s+/).slice(-2).join(" ")}" advice for other tools.
Do not make the brand, community, or content strategy the subject of the article.${COMPOSE_VOICE_RULES}${COMPOSE_SBD_RHETORIC_RULES}`
        : `\nArticle subject: ${topic}
Write an authoritative editorial article ABOUT this topic in full brand voice (perspective, rhetorical patterns, fingerprints).
Do not make the brand, community, or content strategy the subject of the article.
Do not add sections about community engagement, creating content, or promoting the brand.${manifestoBlock}${lensBlock}${openingBlock}${rhythmBlock}${COMPOSE_VOICE_RULES}${COMPOSE_SBD_RHETORIC_RULES}`
      : "";

  const viewpointRule = opts.composeMode
    ? "- Apply full brand voice (perspective, caveats, rhetorical patterns) while keeping the topic as the article subject — not brand-as-subject sections."
    : "- Include the brand's viewpoint and caveats where relevant.";

  const linkRulesBlock =
    opts.links.length > 0
      ? `\nRequired links:
- Weave each URL into normal sentence grammar as inline <a href> anchors.
- Never end a sentence with a parenthetical link like (anchor text) or a trailing See anchor.
- Do not add sentences whose only purpose is to hold a link; wrap a phrase already in the sentence when possible.${
          opts.composeMode
            ? `
- Spread links across the middle of the article — not in the final paragraph.
- Do NOT add a "Related links" section or link dump at the end.
- Do not add closing CTA sentences whose only job is to hold a link.`
            : ""
        }`
      : "";

  return `Write a full blog article in HTML from structured facts and brand interpretation.
Rules:
- Do NOT rewrite any original draft text. You never saw the original wording.
- Use ONLY extracted facts and brand interpretation below.
${viewpointRule}
- Output an HTML fragment only (<p>, <h2>, <h3>, <ul>, <li>, <ol>, <strong>, <a href="...">). No markdown. No <html>/<body>.
- Do not invent statistics, quotes, or offers not in the facts.
- Avoid generic AI and affiliate marketing language.
- Do not use these phrases:
${rewriterBlacklistPromptBlock()}${composeTopicBlock}${linkRulesBlock}${hybridRulesBlock(opts.facts, opts.composeMode, opts.subtopics)}${proceduralRulesBlock(opts.facts)}${depthBlock}${subtopicsBlock}${faqBlock}
${styleLines.length ? `\n${styleLines.join("\n")}` : ""}${personaBlock}${constraintsBlock}${fingerprintsBlock(memory)}`;
}

export async function reconstructArticleHtml(opts: ReconstructArticleOpts): Promise<string> {
  if (!env.openaiApiKey) throw new Error("openai_not_configured");

  const linkBlock =
    opts.links.length > 0
      ? `\nLinks to weave in (required when listed):\n${formatWriterLinksForPrompt(opts.links, {
          exactAnchorLabels: opts.exactLinkLabels,
        })}\nEach URL exactly once, spread across the body.`
      : "";

  const retryBlock =
    opts.retryIssues?.length && (opts.attempt ?? 0) > 1
      ? `\nFix these issues from the prior attempt:\n${opts.retryIssues.map((i) => `- ${i}`).join("\n")}`
      : "";

  const userPrompt = [
    opts.composeMode && opts.topic?.trim() ? `Topic: ${opts.topic.trim()}` : "",
    "Extracted facts (JSON):",
    JSON.stringify(opts.facts, null, 2),
    formatNarrativeSectionsForPrompt(opts.facts),
    formatSectionsForPrompt(opts.facts),
    opts.composeOutline ? formatComposeOutlineForPrompt(opts.composeOutline) : "",
    "",
    "Brand interpretation (JSON):",
    JSON.stringify(opts.interpretation, null, 2),
    formatExamplesForPrompt(opts.examples, opts.composeMode),
    opts.composeMode ? formatBrandDetailsForPrompt(opts.examples) : "",
    linkBlock,
    retryBlock,
    "",
    "Write the article now.",
  ]
    .filter(Boolean)
    .join("\n");

  const temperature = Math.min(0.85, 0.45 + ((opts.attempt ?? 1) - 1) * 0.12);
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensWriter,
    temperature,
    messages: [
      { role: "system", content: buildReconstructionSystemPrompt(opts) },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("article_reconstruction_empty");
  return raw;
}
