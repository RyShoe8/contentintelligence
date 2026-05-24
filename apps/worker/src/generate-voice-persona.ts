import type { ContentSignal, Voice } from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "./env.js";

export async function generateVoicePersona(opts: {
  voice: Voice;
  researchCorpus: string;
  linkedSignals: ContentSignal[];
}): Promise<string> {
  const { voice, researchCorpus, linkedSignals } = opts;

  const signalBlock = linkedSignals.length
    ? linkedSignals
        .map(
          (s) =>
            `- ${s.name}: ${s.description || "(no description)"}; keywords: ${(s.keywords ?? []).join(", ") || "none"}`,
        )
        .join("\n")
    : "(none linked yet)";

  const fallback = [
    `# ${voice.name} voice`,
    "",
    "Tone: friendly, promotional, concise.",
    `Keywords: ${voice.keywords.join(", ") || "none"}`,
    "",
    "Write social posts in this voice while preserving factual deal details from the input.",
  ].join("\n");

  if (!env.openaiApiKey) {
    return fallback;
  }

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const userParts = [
    `Voice name: ${voice.name}`,
    voice.website_url ? `Website: ${voice.website_url}` : null,
    voice.rss_feed_url ? `RSS: ${voice.rss_feed_url}` : null,
    voice.keywords.length ? `Keywords: ${voice.keywords.join(", ")}` : null,
    voice.social_links.length
      ? `Social links: ${voice.social_links.map((l) => l.url).join(", ")}`
      : null,
    "",
    "Linked content signals:",
    signalBlock,
    "",
    "Research corpus from web/RSS/social:",
    researchCorpus || "(no external content fetched — use voice metadata only)",
  ].filter((x) => x != null);

  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: 1200,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `You create an editable brand voice persona template for social media post generation.
Output plain text (no markdown code fences) with these sections:
1. Voice summary (2-3 sentences)
2. Tone & personality traits (bullet list)
3. Vocabulary & phrasing (words to use, words to avoid)
4. Sentence structure & formatting habits
5. Do / Don't rules for promotional posts
6. 2-3 example post snippets in this voice (generic placeholders, not real URLs)

Base the persona on the research corpus and linked content signal themes. Be specific and actionable.`,
      },
      { role: "user", content: userParts.join("\n") },
    ],
  });

  return res.choices[0]?.message?.content?.trim() || fallback;
}
