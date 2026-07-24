import OpenAI from "openai";
import { env } from "../../env.js";
import { researchModel, utilityModel, writerModel } from "./model-registry.js";

export type LlmTier = "writer" | "utility" | "research";

export function modelForTier(tier: LlmTier): string {
  if (tier === "writer") return writerModel();
  if (tier === "research") return researchModel();
  return utilityModel();
}

export async function completeJson<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Defaults to the utility tier — structured extraction and scoring. */
  tier?: LlmTier;
}): Promise<T | null> {
  if (!env.openaiApiKey) return null;

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: modelForTier(opts.tier ?? "utility"),
    max_tokens: opts.maxTokens ?? env.maxTokensBrandAnalyze,
    temperature: opts.temperature ?? 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
