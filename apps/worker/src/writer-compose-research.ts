import OpenAI from "openai";
import { env } from "./env.js";
import {
  formatReferenceCorpusForPrompt,
  type ReferenceCorpusSection,
} from "./writer-reference-corpus.js";

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
