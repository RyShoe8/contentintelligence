import { z } from "zod";
import { writerComposeResearchConfig } from "@content-resourcer/db";
import { env } from "./env.js";
import { completeJson } from "./services/llm/json-completion.js";

export type TopicResearchPlan = {
  research_questions: string[];
  angles: string[];
  caveats_to_investigate: string[];
  search_queries: string[];
};

export type PlanTopicResearchOpts = {
  topic: string;
  voiceKeywords?: string[];
  hasUserReferences: boolean;
  maxSearchQueries?: number;
  userSubtopics?: string[];
  articleDepth?: number;
};

export function mergeUserSubtopicsIntoPlan(
  plan: TopicResearchPlan,
  userSubtopics: string[] = [],
  maxQuestions = 8,
): TopicResearchPlan {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const raw of userSubtopics) {
    const topic = raw.trim();
    if (topic.length < 3) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(topic);
  }

  for (const q of plan.research_questions) {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(q.trim());
  }

  return { ...plan, research_questions: merged.slice(0, maxQuestions) };
}

const planSchema = z.object({
  research_questions: z.array(z.string().trim().min(1)).min(3).max(12),
  angles: z.array(z.string().trim().min(1)).max(8).default([]),
  caveats_to_investigate: z.array(z.string().trim().min(1)).max(8).default([]),
  search_queries: z.array(z.string().trim().min(1)).min(1).max(5),
});

export function buildTopicResearchPlanPrompts(opts: PlanTopicResearchOpts): {
  systemPrompt: string;
  userPrompt: string;
} {
  const topic = opts.topic.trim();
  const keywords =
    opts.voiceKeywords?.filter(Boolean).join(", ") || "(none specified)";
  const researchConfig = writerComposeResearchConfig(opts.articleDepth ?? 50);
  const searchQueryRule =
    researchConfig.maxSearchQueries >= 5
      ? "- search_queries: 3-5 concise web search strings to find authoritative sources on the topic."
      : "- search_queries: 2-3 concise web search strings to find authoritative sources on the topic.";

  const systemPrompt = `You plan editorial research for article writing.
Output JSON only with keys: research_questions, angles, caveats_to_investigate, search_queries.
Rules:
- research_questions: 4-6 focused sub-questions that deeply investigate the topic (not generic).
- angles: 2-4 distinct editorial angles or narratives to explore.
- caveats_to_investigate: 2-4 limitations, counterpoints, or nuance to verify.
${searchQueryRule}
- Questions must be about the TOPIC itself, not about summarizing URLs.
- If the user may supply reference pages, plan what facts to extract — do not assume page content.`;

  const userPrompt = [
    `Topic: ${topic}`,
    `Voice keywords (context): ${keywords}`,
    opts.hasUserReferences
      ? "The user will provide reference URLs; plan what to extract from them."
      : "No user reference URLs; search queries should help discover sources.",
    opts.userSubtopics?.length
      ? `User-required subtopics (must be researched):\n${opts.userSubtopics.map((s) => `- ${s}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

function fallbackPlan(topic: string): TopicResearchPlan {
  const trimmed = topic.trim();
  return {
    research_questions: [
      `What are the core facts and definitions needed to explain "${trimmed}"?`,
      `What are the main approaches, methods, or frameworks related to "${trimmed}"?`,
      `What common misconceptions or caveats apply to "${trimmed}"?`,
      `What practical examples or use cases illustrate "${trimmed}"?`,
    ],
    angles: [`Overview and fundamentals of ${trimmed}`, `Practical implications of ${trimmed}`],
    caveats_to_investigate: ["Verify claims against primary sources", "Note where evidence is uncertain"],
    search_queries: [trimmed, `${trimmed} guide`, `${trimmed} research`],
  };
}

export async function planTopicResearch(opts: PlanTopicResearchOpts): Promise<TopicResearchPlan> {
  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  const researchConfig = writerComposeResearchConfig(opts.articleDepth ?? 50);
  const maxQuestions = researchConfig.maxResearchQuestions;

  const { systemPrompt, userPrompt } = buildTopicResearchPlanPrompts(opts);
  const raw = await completeJson<unknown>({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: env.maxTokensWriterResearchPlan,
    temperature: 0.3,
  });

  if (!raw) {
    return mergeUserSubtopicsIntoPlan(fallbackPlan(opts.topic), opts.userSubtopics, maxQuestions);
  }

  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) {
    return mergeUserSubtopicsIntoPlan(fallbackPlan(opts.topic), opts.userSubtopics, maxQuestions);
  }

  const llmQuestionCap = Math.min(6, maxQuestions);
  return mergeUserSubtopicsIntoPlan(
    {
      research_questions: parsed.data.research_questions.slice(0, llmQuestionCap),
      angles: parsed.data.angles,
      caveats_to_investigate: parsed.data.caveats_to_investigate,
      search_queries: parsed.data.search_queries.slice(
        0,
        opts.maxSearchQueries ?? researchConfig.maxSearchQueries,
      ),
    },
    opts.userSubtopics,
    maxQuestions,
  );
}
