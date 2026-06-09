import {
  formatWriterLinksForPrompt,
  isHybridContentFacts,
  rewriterBlacklistPromptBlock,
  writerArticleDepthGuidance,
  type BrandInterpretation,
  type BrandMemory,
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
} from "./compose-voice-rules.js";
import type { ArticleRewriteExample } from "./types.js";

const EXAMPLE_EXCERPT_CHARS = 1500;
const COMPOSE_EXAMPLE_EXCERPT_CHARS = 2800;

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

function hybridRulesBlock(facts: ContentFacts, composeMode?: boolean): string {
  if (composeMode && hasNarrativeSections(facts)) {
    return `
Compose article (editorial voice, not a research summary):
- Cover EVERY point in narrativeSections and EVERY keyDetails entry — nothing omitted.
- Do NOT use research-brief section titles as headings (Topic overview, Key facts, Angles to cover, Caveats and counterpoints, Open questions and weak evidence, FAQ).
- Write editorial <h2>/<h3> headings that fit the topic and match the brand examples below (structure, rhythm, openings).
- Weave all facts into flowing prose in full brand voice — not a labeled brief or bullet dump.
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

function formatExamplesForPrompt(examples: ArticleRewriteExample[], composeMode?: boolean): string {
  if (!examples.length) return "";
  const excerptChars = composeMode ? COMPOSE_EXAMPLE_EXCERPT_CHARS : EXAMPLE_EXCERPT_CHARS;
  const selected = composeMode ? examples.slice(0, 2) : examples;
  const blocks = selected.map((ex, i) => {
    const html =
      ex.html.length > excerptChars ? `${ex.html.slice(0, excerptChars)}…` : ex.html;
    return `### Example ${i + 1}: ${ex.title}\n${html}`;
  });
  const composeNote = composeMode
    ? " Imitate heading style, paragraph length, sentence rhythm, openings/closings, and rhetorical patterns from these examples. Facts come from research; prose comes from these examples plus persona — not from the research brief outline."
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
    opts.subtopics?.length
      ? `\nRequired subtopics (cover each with its own H2 or H3 section):\n${opts.subtopics.map((s) => `- ${s}`).join("\n")}`
      : "";

  const faqBlock = opts.composeMode ? composeFaqPromptRules(opts.includeFaq) : "";

  const topic = opts.topic?.trim();
  const composeTopicBlock =
    opts.composeMode && topic
      ? `\nArticle subject: ${topic}
Write an authoritative editorial article ABOUT this topic in full brand voice (perspective, rhetorical patterns, fingerprints).
Do not make the brand, community, or content strategy the subject of the article.
Do not add sections about community engagement, creating content, or promoting the brand.${COMPOSE_VOICE_RULES}${COMPOSE_SBD_RHETORIC_RULES}`
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
- Output an HTML fragment only (<p>, <h2>, <h3>, <ul>, <li>, <ol>, <a href="...">). No markdown. No <html>/<body>.
- Do not invent statistics, quotes, or offers not in the facts.
- Avoid generic AI and affiliate marketing language.
- Do not use these phrases:
${rewriterBlacklistPromptBlock()}${composeTopicBlock}${linkRulesBlock}${hybridRulesBlock(opts.facts, opts.composeMode)}${proceduralRulesBlock(opts.facts)}${depthBlock}${subtopicsBlock}${faqBlock}
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
    "",
    "Brand interpretation (JSON):",
    JSON.stringify(opts.interpretation, null, 2),
    formatExamplesForPrompt(opts.examples, opts.composeMode),
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
