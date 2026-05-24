import { completeJson } from "../llm/json-completion.js";

type BehaviorJson = { rhetoricalPatterns?: string[] };

export async function extractRhetoricalPatterns(behaviorCorpus: string): Promise<string[]> {
  if (!behaviorCorpus.trim()) return [];

  const parsed = await completeJson<BehaviorJson>({
    system: `Identify recurring rhetorical and structural communication patterns in brand posts.
Return JSON: { "rhetoricalPatterns": string[] }
Examples: "starts with hook question", "short punchy sentences", "contrast framing", "punchline endings".
List 3-8 specific patterns observed in the corpus.`,
    user: behaviorCorpus,
    maxTokens: 400,
    temperature: 0.25,
  });

  return (parsed?.rhetoricalPatterns ?? [])
    .map((p) => String(p).trim())
    .filter(Boolean)
    .slice(0, 15);
}

export function fallbackRhetoricalPatterns(): string[] {
  return [
    "lead with deal hook",
    "short punchy sentences",
    "conversational tone",
  ];
}
