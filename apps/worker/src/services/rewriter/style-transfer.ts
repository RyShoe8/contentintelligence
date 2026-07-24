import type { Db } from "mongodb";
import {
  listWriterStyleExamplesForVoice,
  rewriterBlacklistPromptBlock,
  sanitizeArticleHtmlForLearning,
  writerArticleHtmlForLearning,
  writerComposeReferenceLeakIssues,
  writerLinksMissingFromHtml,
  type ComposeStyleKit,
  type Voice,
  type WriterLink,
} from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "../../env.js";
import { writerModel } from "../llm/model-registry.js";
import { resolveVoiceGenerationContext } from "../../voice-generation-context.js";
import { buildVoiceStylePromptLines, type VoiceStylePromptOpts } from "../../voice-style-rules.js";
import { attachArchetypeToStyleKit, pickPrimaryStyleExample } from "./compose-article-archetype.js";
import { composeFaqPromptRules, composeRhythmPromptRules } from "./compose-voice-rules.js";
import {
  extractComposeStyleKitDeterministic,
  extractConcreteDetails,
  extractRhythmMetrics,
} from "./extract-compose-style-kit.js";
import type { ArticleRewriteExample } from "./types.js";

const REFERENCE_MIN_CHARS = 400;
const REFERENCE_PRESERVE_MIN = 8000;
const PROMPT_OVERHEAD_CHARS = 600;
const MIN_DRAFT_RESERVE = 2000;
const MIN_OUTPUT_RATIO = 0.4;
const BRAND_DETAILS_MAX = 12;

export type StyleTransferReference = {
  title: string;
  html: string;
  composeStyleKit?: ComposeStyleKit;
};

export type StyleTransferPassOpts = {
  voice: Voice;
  html: string;
  referenceHtml: string;
  referenceTitle?: string;
  composeStyleKit?: ComposeStyleKit;
  topic?: string;
  includeFaq?: boolean;
  knownExampleTitles?: string[];
  links?: WriterLink[];
  composeMode?: boolean;
};

function backfillStyleKitFields(kit: ComposeStyleKit, content: string): ComposeStyleKit {
  const needsDetails = !kit.concreteDetails.length;
  const needsRhythm = !kit.rhythm;
  if (!needsDetails && !needsRhythm) return kit;
  const sanitized = sanitizeArticleHtmlForLearning(content);
  return {
    ...kit,
    concreteDetails: needsDetails ? extractConcreteDetails(sanitized) : kit.concreteDetails,
    rhythm: needsRhythm ? extractRhythmMetrics(sanitized) : kit.rhythm,
  };
}

function resolveStyleExampleKit(
  stored: ComposeStyleKit | undefined,
  content: string,
): ComposeStyleKit | undefined {
  if (stored?.archetype) return backfillStyleKitFields(stored, content);
  if (stored) return backfillStyleKitFields(attachArchetypeToStyleKit(stored, content), content);
  return extractComposeStyleKitDeterministic(content);
}

/** Load the best style example (full sanitized HTML) for style transfer. */
export async function loadPrimaryStyleExampleForTransfer(
  db: Db,
  organizationId: string,
  voice: Voice,
): Promise<StyleTransferReference | undefined> {
  const articles = await listWriterStyleExamplesForVoice(db, organizationId, voice.id);
  const examples: ArticleRewriteExample[] = [];
  for (const article of articles) {
    const html = sanitizeArticleHtmlForLearning(writerArticleHtmlForLearning(article) ?? "");
    if (!html.trim()) continue;
    examples.push({
      title: article.title,
      html,
      composeStyleKit: resolveStyleExampleKit(article.compose_style_kit, html),
    });
  }

  const primary = pickPrimaryStyleExample(examples);
  if (!primary?.html?.trim()) return undefined;

  return {
    title: primary.title,
    html: primary.html,
    composeStyleKit: primary.composeStyleKit,
  };
}

export function shouldRunStyleTransfer(referenceHtml: string | undefined): boolean {
  return (referenceHtml?.trim().length ?? 0) >= REFERENCE_MIN_CHARS;
}

function trimMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 3) return text.slice(0, maxLen);
  const head = Math.floor(maxLen * 0.45);
  const tail = maxLen - head - 1;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/** Fit reference + draft within model input budget; reference is prioritized. */
export function budgetStyleTransferInputs(
  referenceHtml: string,
  draftHtml: string,
  maxChars: number,
): { referenceHtml: string; draftHtml: string } {
  const available = Math.max(1000, maxChars - PROMPT_OVERHEAD_CHARS);
  if (referenceHtml.length + draftHtml.length <= available) {
    return { referenceHtml, draftHtml };
  }

  const refTarget = Math.min(
    referenceHtml.length,
    Math.max(REFERENCE_PRESERVE_MIN, Math.floor(available * 0.45)),
  );
  let reference = referenceHtml.length <= refTarget ? referenceHtml : trimMiddle(referenceHtml, refTarget);
  let draftBudget = available - reference.length;

  if (draftBudget < MIN_DRAFT_RESERVE && referenceHtml.length > REFERENCE_PRESERVE_MIN) {
    reference = trimMiddle(referenceHtml, Math.max(REFERENCE_PRESERVE_MIN, available - MIN_DRAFT_RESERVE));
    draftBudget = available - reference.length;
  }

  const draft = trimMiddle(draftHtml, Math.max(500, draftBudget));
  return { referenceHtml: reference, draftHtml: draft };
}

function brandDetailsBlock(kit?: ComposeStyleKit): string {
  const details = kit?.concreteDetails ?? [];
  if (!details.length) return "";
  const lines = details.slice(0, BRAND_DETAILS_MAX).map((d) => `- ${d}`);
  return `\nBrand concrete details from reference (weave where relevant in draft; copy faithfully; NEVER invent new statistics):\n${lines.join("\n")}`;
}

export function buildStyleTransferSystemPrompt(opts: {
  voice: Voice;
  composeStyleKit?: ComposeStyleKit;
  topic?: string;
  includeFaq?: boolean;
  composeMode?: boolean;
  referenceTitle?: string;
  retryIssues?: string[];
}): string {
  const ctx = resolveVoiceGenerationContext(opts.voice);
  const style: VoiceStylePromptOpts = {
    brandName: ctx.brandName,
    brandMentionLevel: ctx.brandMentionLevel,
    contentProviderName: undefined,
    sourcesInPostsLevel: ctx.sourcesInPostsLevel,
    preferredPhrases: ctx.preferredPhrases,
  };
  const styleLines = buildVoiceStylePromptLines(style);
  const personaBlock = ctx.persona?.trim() ? `\nBrand persona:\n${ctx.persona.trim()}` : "";
  const rhythmBlock = composeRhythmPromptRules(opts.composeStyleKit?.rhythm);
  const detailsBlock = brandDetailsBlock(opts.composeStyleKit);
  const faqBlock = opts.composeMode ? composeFaqPromptRules(opts.includeFaq) : "";
  const topicBlock = opts.topic?.trim()
    ? `\n- Preserve topic focus on "${opts.topic.trim()}"; do not drift into brand-as-subject or meta community sections.`
    : "";
  const titleBlock = opts.referenceTitle?.trim()
    ? `\n- Do NOT copy the reference title "${opts.referenceTitle.trim()}" or reference metadata into the draft.`
    : "";
  const retryBlock = opts.retryIssues?.length
    ? `\nAddress these issues:\n${opts.retryIssues.map((i) => `- ${i}`).join("\n")}`
    : "";

  return `Rewrite a draft HTML article to match the voice, rhythm, paragraph length, section roles, openings/closings, and conviction patterns of a reference brand article.
Rules:
- Output an HTML fragment only (<p>, <h2>, <h3>, <ul>, <li>, <ol>, <strong>, <a href="...">). No markdown. No <html>/<body>.
- Match the reference article's staccato rhythm, operator we-voice, and editorial structure — not a neutral industry guide.
- Preserve ALL factual claims, statistics, and named entities from the draft.
- Keep every existing <a href="..."> URL and anchor text unchanged.
- Preserve procedural <ol><li> step lists and FAQ Q&A content when present in the draft.
- Do not invent new statistics, names, or places not in the draft.
- Do not copy reference navigation, dates, share buttons, or blog chrome.${titleBlock}${topicBlock}${faqBlock}${rhythmBlock}${detailsBlock}
- Do not use:
${rewriterBlacklistPromptBlock()}${personaBlock}
${styleLines.length ? `\n${styleLines.join("\n")}` : ""}${retryBlock}`;
}

function buildStyleTransferUserPrompt(referenceHtml: string, draftHtml: string): string {
  return [
    "Reference article (match voice and structure — do not copy title or chrome):",
    referenceHtml,
    "",
    "Draft to rewrite:",
    draftHtml,
  ].join("\n");
}

export function validateStyleTransferOutput(opts: {
  originalHtml: string;
  outputHtml: string;
  links?: WriterLink[];
  knownExampleTitles?: string[];
}): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const output = opts.outputHtml.trim();
  if (!output || output.length < 80) {
    issues.push("Style transfer returned empty or too-short output");
  }
  if (output.length < opts.originalHtml.length * MIN_OUTPUT_RATIO) {
    issues.push("Style transfer output much shorter than draft — likely truncated");
  }
  if (opts.links?.length) {
    const missing = writerLinksMissingFromHtml(output, opts.links);
    if (missing.length) {
      issues.push(`Style transfer dropped ${missing.length} required link(s)`);
    }
  }
  if (opts.knownExampleTitles?.length) {
    issues.push(...writerComposeReferenceLeakIssues(output, opts.knownExampleTitles));
  }
  return { ok: issues.length === 0, issues };
}

async function callStyleTransferLlm(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: writerModel(),
    max_tokens: env.maxTokensWriter,
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("style_transfer_empty");
  return raw;
}

/** Final pass: restyle draft against full primary style example HTML. */
export async function runStyleTransferPass(opts: StyleTransferPassOpts): Promise<string> {
  const originalHtml = opts.html.trim();
  if (!originalHtml || !shouldRunStyleTransfer(opts.referenceHtml)) return originalHtml;
  if (!env.openaiApiKey) return originalHtml;

  const { referenceHtml, draftHtml } = budgetStyleTransferInputs(
    opts.referenceHtml.trim(),
    originalHtml,
    env.maxWriterInputChars,
  );

  const basePromptOpts = {
    voice: opts.voice,
    composeStyleKit: opts.composeStyleKit,
    topic: opts.topic,
    includeFaq: opts.includeFaq,
    composeMode: opts.composeMode,
    referenceTitle: opts.referenceTitle,
  };

  const userPrompt = buildStyleTransferUserPrompt(referenceHtml, draftHtml);
  let output = await callStyleTransferLlm(
    buildStyleTransferSystemPrompt(basePromptOpts),
    userPrompt,
  );

  let validation = validateStyleTransferOutput({
    originalHtml,
    outputHtml: output,
    links: opts.links,
    knownExampleTitles: opts.knownExampleTitles,
  });

  const leakOnly =
    validation.issues.length > 0 &&
    validation.issues.every(
      (i) =>
        i.includes("copies style example title") ||
        i.includes("blog chrome") ||
        i.includes("Back to Blog") ||
        i.includes("Share"),
    );

  if (!validation.ok && leakOnly) {
    output = await callStyleTransferLlm(
      buildStyleTransferSystemPrompt({ ...basePromptOpts, retryIssues: validation.issues }),
      userPrompt,
    );
    validation = validateStyleTransferOutput({
      originalHtml,
      outputHtml: output,
      links: opts.links,
      knownExampleTitles: opts.knownExampleTitles,
    });
  }

  return validation.ok ? output : originalHtml;
}
