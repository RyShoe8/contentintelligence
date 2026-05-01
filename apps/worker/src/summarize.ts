import OpenAI from "openai";
import { env } from "./env.js";

export async function summarizeEmailBody(cleanText: string): Promise<string> {
  if (!env.openaiApiKey) {
    return "";
  }
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const input = cleanText.slice(0, env.maxAiInputChars);
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensSummary,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "Summarize the marketing or promotional email in 1–3 concise sentences. Focus on offers, deadlines, and key actions. No preamble.",
      },
      { role: "user", content: input },
    ],
  });
  const text = res.choices[0]?.message?.content?.trim() ?? "";
  return text;
}
