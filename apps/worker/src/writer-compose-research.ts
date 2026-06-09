import OpenAI from "openai";
import {
  writerArticleDepthGuidance,
  writerComposeFaqCountGuidance,
  writerComposeResearchConfig,
} from "@content-resourcer/db";
import { env } from "./env.js";
import {
  formatReferenceCorpusForPrompt,
  type ReferenceCorpusSection,
} from "./writer-reference-corpus.js";
import type { TopicResearchPlan } from "./writer-topic-research-plan.js";

export type SynthesizeResearchBriefOpts = {
  topic: string;
  corpusSections: ReferenceCorpusSection[];
  articleDepth?: number;
  subtopics?: string[];
  includeFaq?: boolean;
};

function subtopicsBlock(subtopics?: string[]): string {
  if (!subtopics?.length) return "";
  return `\nRequired subtopics to cover in the brief:\n${subtopics.map((s) => `- ${s}`).join("\n")}`;
}

function briefStructureLine(includeFaq?: boolean): string {
  if (includeFaq) {
    return "- Structure with short labeled sections: Key facts, Angles to cover, Caveats.";
  }
  return "- Structure with short labeled sections: Key facts, Angles to cover, Caveats. Do not include FAQ or Q&A content.";
}

function faqBriefRules(includeFaq?: boolean, articleDepth?: number): string {
  if (!includeFaq) {
    return "- Do not include an FAQ, frequently asked questions, or Q&A section in the brief.";
  }
  const faqCount = writerComposeFaqCountGuidance(articleDepth ?? 50);
  return `- Include a labeled FAQ section with ${faqCount.min}–${faqCount.max} question-and-answer pairs.
- Format each pair as "Q: ...?" on one line and "A: ..." on the next (or numbered pairs).
- Ground answers in reference excerpts when available; mark uncertain answers explicitly.`;
}

function deepConsolidationStructureLine(includeFaq?: boolean): string {
  if (includeFaq) {
    return "- Structure with labeled sections: Topic overview, Key facts, Angles to cover, Caveats and counterpoints, FAQ, Open questions and weak evidence.";
  }
  return "- Structure with labeled sections: Topic overview, Key facts, Angles to cover, Caveats and counterpoints, Open questions and weak evidence. Do not include FAQ or Q&A content.";
}

export function buildResearchBriefPrompts(opts: SynthesizeResearchBriefOpts): {
  systemPrompt: string;
  userPrompt: string;
  hasReferences: boolean;
} {
  const topic = opts.topic.trim();
  const hasReferences = opts.corpusSections.length > 0;
  const corpusBlock = formatReferenceCorpusForPrompt(opts.corpusSections);
  const depth =
    opts.articleDepth != null
      ? writerArticleDepthGuidance(opts.articleDepth)
      : writerArticleDepthGuidance(50);

  const systemPrompt = `You synthesize research briefs for editorial article writing.
Rules:
- Output plain text only (no markdown fences, no HTML).
${briefStructureLine(opts.includeFaq)}
${faqBriefRules(opts.includeFaq, opts.articleDepth)}
- When reference excerpts are provided, treat them as primary evidence. Do not invent specific facts, stats, or quotes not supported by the references.
- When no references are provided, use general knowledge but mark uncertain claims with phrasing like "may" or "often".
- Write enough detail for a full article (${depth.researchBriefPrompt}).
- Do not write the finished article; only the research brief.`;

  const userPrompt = [
    `Topic: ${topic}`,
    subtopicsBlock(opts.subtopics),
    "",
    hasReferences
      ? "Reference excerpts (primary sources):"
      : "No reference URLs were fetched — use cautious general knowledge.",
    corpusBlock,
  ].join("\n");

  return { systemPrompt, userPrompt, hasReferences };
}

export async function synthesizeResearchBrief(
  opts: SynthesizeResearchBriefOpts,
): Promise<string> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  const { systemPrompt, userPrompt } = buildResearchBriefPrompts(opts);

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensWriter,
    temperature: 0.35,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const brief = res.choices[0]?.message?.content?.trim();
  if (!brief || brief.length < 100) {
    throw new Error("research_brief_empty");
  }
  return brief;
}

export type RunDeepTopicResearchOpts = {
  topic: string;
  plan: TopicResearchPlan;
  corpusSections: ReferenceCorpusSection[];
  articleDepth?: number;
  subtopics?: string[];
  includeFaq?: boolean;
};

function chunkQuestions(questions: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < questions.length; i += size) {
    chunks.push(questions.slice(i, i + size));
  }
  return chunks;
}

export function buildDeepResearchSectionPrompts(opts: {
  topic: string;
  questions: string[];
  corpusSections: ReferenceCorpusSection[];
  hasUserReferences: boolean;
  subtopics?: string[];
  minCitationsPerSection?: number;
}): { systemPrompt: string; userPrompt: string } {
  const corpusBlock = formatReferenceCorpusForPrompt(opts.corpusSections);
  const minCitations = opts.minCitationsPerSection ?? 1;

  const systemPrompt = `You answer editorial research sub-questions using provided source excerpts.
Rules:
- Output plain text only (no markdown fences, no HTML).
- For each question, write a heading with the question text, then bullet notes.
- Include at least ${minCitations} inline source URL citation(s) per question when sources support the answer.
- Cite the source URL when a fact comes from a reference excerpt.
- Mark weak or uncertain claims explicitly (e.g. "uncertain — not found in sources").
- If a question cannot be answered from sources, write "Not found in sources" and optionally add cautious general context (may/often) only when no user references exist.
- Do not invent specific stats or quotes unsupported by sources.`;

  const userPrompt = [
    `Topic: ${opts.topic.trim()}`,
    "",
    "Answer these research questions:",
    ...opts.questions.map((q, i) => `${i + 1}. ${q}`),
    subtopicsBlock(opts.subtopics),
    "",
    opts.corpusSections.length
      ? "Source excerpts:"
      : "No source excerpts — use cautious general knowledge and mark uncertainty.",
    corpusBlock,
  ].join("\n");

  return { systemPrompt, userPrompt };
}

export function buildDeepResearchConsolidationPrompts(opts: {
  topic: string;
  plan: TopicResearchPlan;
  sectionNotes: string;
  articleDepth?: number;
  subtopics?: string[];
  includeFaq?: boolean;
}): { systemPrompt: string; userPrompt: string } {
  const depth =
    opts.articleDepth != null
      ? writerArticleDepthGuidance(opts.articleDepth)
      : writerArticleDepthGuidance(50);

  const systemPrompt = `You consolidate editorial research notes into one deep research brief.
Rules:
- Output plain text only (no markdown fences, no HTML).
${deepConsolidationStructureLine(opts.includeFaq)}
${faqBriefRules(opts.includeFaq, opts.articleDepth)}
- Preserve evidence-backed facts and source URL citations from the notes.
- Target ${depth.researchBriefPrompt}.
- Do not write the finished article; only the research brief.`;

  const userPrompt = [
    `Topic: ${opts.topic.trim()}`,
    subtopicsBlock(opts.subtopics),
    "",
    "Planned angles:",
    ...opts.plan.angles.map((a) => `- ${a}`),
    "",
    "Caveats to investigate:",
    ...opts.plan.caveats_to_investigate.map((c) => `- ${c}`),
    "",
    "Research notes by question:",
    opts.sectionNotes,
  ].join("\n");

  return { systemPrompt, userPrompt };
}

async function callOpenAiText(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: maxTokens,
    temperature: 0.35,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

function buildGapFillPrompts(opts: {
  topic: string;
  plan: TopicResearchPlan;
  sectionNotes: string;
  corpusSections: ReferenceCorpusSection[];
}): { systemPrompt: string; userPrompt: string } {
  const corpusBlock = formatReferenceCorpusForPrompt(opts.corpusSections);
  return {
    systemPrompt: `You fill gaps in editorial research using only provided source excerpts.
Rules:
- Output plain text only (no markdown fences, no HTML).
- Address caveats and open questions from the plan using corpus evidence only.
- Cite source URLs for every factual claim; mark uncertain items explicitly.
- Do not invent stats or quotes.`,
    userPrompt: [
      `Topic: ${opts.topic.trim()}`,
      "",
      "Caveats to investigate:",
      ...opts.plan.caveats_to_investigate.map((c) => `- ${c}`),
      "",
      "Existing research notes:",
      opts.sectionNotes.slice(0, 12000),
      "",
      "Source excerpts:",
      corpusBlock,
    ].join("\n"),
  };
}

export async function runDeepTopicResearch(opts: RunDeepTopicResearchOpts): Promise<string> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  const researchConfig = writerComposeResearchConfig(opts.articleDepth ?? 50);
  const hasUserReferences = opts.corpusSections.some((s) => s.source === "user");
  const questionChunks = chunkQuestions(
    opts.plan.research_questions,
    researchConfig.sectionBatchSize,
  );
  const sectionParts: string[] = [];

  for (const questions of questionChunks) {
    const { systemPrompt, userPrompt } = buildDeepResearchSectionPrompts({
      topic: opts.topic,
      questions,
      corpusSections: opts.corpusSections,
      hasUserReferences,
      subtopics: opts.subtopics,
      minCitationsPerSection: researchConfig.minCitationsPerSection,
    });
    const notes = await callOpenAiText(
      systemPrompt,
      userPrompt,
      env.maxTokensWriterResearchSection,
    );
    if (notes) sectionParts.push(notes);
  }

  const sectionNotes = sectionParts.join("\n\n").trim();
  if (!sectionNotes) {
    return synthesizeResearchBrief({
      topic: opts.topic,
      corpusSections: opts.corpusSections,
      articleDepth: opts.articleDepth,
      subtopics: opts.subtopics,
      includeFaq: opts.includeFaq,
    });
  }

  const { systemPrompt, userPrompt } = buildDeepResearchConsolidationPrompts({
    topic: opts.topic,
    plan: opts.plan,
    sectionNotes,
    articleDepth: opts.articleDepth,
    subtopics: opts.subtopics,
    includeFaq: opts.includeFaq,
  });
  let brief = await callOpenAiText(
    systemPrompt,
    userPrompt,
    env.maxTokensWriter,
  );

  if (researchConfig.gapFillPass && opts.plan.caveats_to_investigate.length > 0) {
    const gap = buildGapFillPrompts({
      topic: opts.topic,
      plan: opts.plan,
      sectionNotes,
      corpusSections: opts.corpusSections,
    });
    const gapNotes = await callOpenAiText(
      gap.systemPrompt,
      gap.userPrompt,
      env.maxTokensWriterResearchSection,
    );
    if (gapNotes.trim()) {
      brief = `${brief.trim()}\n\nAdditional gap-fill research:\n${gapNotes.trim()}`;
    }
  }

  if (!brief || brief.length < 100) {
    throw new Error("research_brief_empty");
  }
  return brief;
}
