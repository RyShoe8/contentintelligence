import {
  findRewriterBlacklistMatches,
  genericityAnalysisSchema,
  stripHtmlToPlainText,
  type GenericityAnalysis,
} from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";

export function analyzeGenericityDeterministic(html: string): GenericityAnalysis {
  const plain = stripHtmlToPlainText(html);
  const hits = findRewriterBlacklistMatches(plain);
  const score = Math.min(100, hits.length * 18 + (plain.match(/!/g)?.length ?? 0) * 3);
  return genericityAnalysisSchema.parse({
    score,
    issues: hits.map((h) => `Contains cliché: "${h}"`),
  });
}

export async function analyzeGenericity(html: string): Promise<GenericityAnalysis> {
  const deterministic = analyzeGenericityDeterministic(html);
  const plain = stripHtmlToPlainText(html);

  const llm = await completeJson<unknown>({
    system: `Score how generic, AI-generated, or affiliate-spammy this article text is.
Reply JSON only: {"score": number,"issues": string[]}
score 0 = human-authored editorial; 100 = obvious AI/affiliate template.
List specific issues (promotional urgency, LinkedIn fluff, empty hype).`,
    user: plain.slice(0, 8000),
    temperature: 0.2,
    maxTokens: 500,
  });

  const parsed = genericityAnalysisSchema.safeParse(llm);
  if (!parsed.success) return deterministic;

  const combinedScore = Math.round(Math.max(deterministic.score, parsed.data.score));
  const issues = [...new Set([...deterministic.issues, ...parsed.data.issues])].slice(0, 12);
  return genericityAnalysisSchema.parse({ score: combinedScore, issues });
}
