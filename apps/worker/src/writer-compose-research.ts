import OpenAI from "openai";
import { env } from "./env.js";
import {
  formatReferenceCorpusForPrompt,
  type ReferenceCorpusSection,
} from "./writer-reference-corpus.js";
import type { TopicResearchPlan } from "./writer-topic-research-plan.js";

export type SynthesizeResearchBriefOpts = {
  topic: string;
  corpusSections: ReferenceCorpusSection[];
  voiceKeywords?: string[];
};

export function buildResearchBriefPrompts(opts: SynthesizeResearchBriefOpts): {
  systemPrompt: string;
  userPrompt: string;
  hasReferences: boolean;
} {
  const topic = opts.topic.trim();
  const hasReferences = opts.corpusSections.length > 0;
  const corpusBlock = formatReferenceCorpusForPrompt(opts.corpusSections);
  const keywords =
    opts.voiceKeywords?.filter(Boolean).join(", ") || "(none specified)";

  const systemPrompt = `You synthesize research briefs for editorial article writing.
Rules:
- Output plain text only (no markdown fences, no HTML).
- Structure with short labeled sections: Key facts, Angles to cover, Caveats, FAQ ideas (if relevant).
- When reference excerpts are provided, treat them as primary evidence. Do not invent specific facts, stats, or quotes not supported by the references.
- When no references are provided, use general knowledge but mark uncertain claims with phrasing like "may" or "often".
- Write enough detail for a full article (roughly 400–1200 words of briefing content).
- Do not write the finished article; only the research brief.`;

  const userPrompt = [
    `Topic: ${topic}`,
    `Voice keywords (context): ${keywords}`,
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
  voiceKeywords?: string[];
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
  voiceKeywords?: string[];
  hasUserReferences: boolean;
}): { systemPrompt: string; userPrompt: string } {
  const corpusBlock = formatReferenceCorpusForPrompt(opts.corpusSections);
  const keywords =
    opts.voiceKeywords?.filter(Boolean).join(", ") || "(none specified)";

  const systemPrompt = `You answer editorial research sub-questions using provided source excerpts.
Rules:
- Output plain text only (no markdown fences, no HTML).
- For each question, write a heading with the question text, then bullet notes.
- Cite the source URL when a fact comes from a reference excerpt.
- If a question cannot be answered from sources, write "Not found in sources" and optionally add cautious general context (may/often) only when no user references exist.
- Do not invent specific stats or quotes unsupported by sources.`;

  const userPrompt = [
    `Topic: ${opts.topic.trim()}`,
    `Voice keywords: ${keywords}`,
    "",
    "Answer these research questions:",
    ...opts.questions.map((q, i) => `${i + 1}. ${q}`),
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
  voiceKeywords?: string[];
}): { systemPrompt: string; userPrompt: string } {
  const keywords =
    opts.voiceKeywords?.filter(Boolean).join(", ") || "(none specified)";

  const systemPrompt = `You consolidate editorial research notes into one deep research brief.
Rules:
- Output plain text only (no markdown fences, no HTML).
- Structure with labeled sections: Topic overview, Key facts, Angles to cover, Caveats and counterpoints, FAQ ideas, Open questions and weak evidence.
- Preserve evidence-backed facts and source URL citations from the notes.
- Target 800–2000 words of briefing content.
- Do not write the finished article; only the research brief.`;

  const userPrompt = [
    `Topic: ${opts.topic.trim()}`,
    `Voice keywords: ${keywords}`,
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

export async function runDeepTopicResearch(opts: RunDeepTopicResearchOpts): Promise<string> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  const hasUserReferences = opts.corpusSections.some((s) => s.source === "user");
  const questionChunks = chunkQuestions(opts.plan.research_questions, 2);
  const sectionParts: string[] = [];

  for (const questions of questionChunks) {
    const { systemPrompt, userPrompt } = buildDeepResearchSectionPrompts({
      topic: opts.topic,
      questions,
      corpusSections: opts.corpusSections,
      voiceKeywords: opts.voiceKeywords,
      hasUserReferences,
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
      voiceKeywords: opts.voiceKeywords,
    });
  }

  const { systemPrompt, userPrompt } = buildDeepResearchConsolidationPrompts({
    topic: opts.topic,
    plan: opts.plan,
    sectionNotes,
    voiceKeywords: opts.voiceKeywords,
  });
  const brief = await callOpenAiText(
    systemPrompt,
    userPrompt,
    env.maxTokensWriter,
  );

  if (!brief || brief.length < 100) {
    throw new Error("research_brief_empty");
  }
  return brief;
}
