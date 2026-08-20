import type { Voice } from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "../../env.js";
import { researchModel } from "../llm/model-registry.js";
import { resolveVoiceGenerationContext } from "../../voice-generation-context.js";
import { buildVoiceStylePromptLines } from "../../voice-style-rules.js";
import {
  COMPOSE_EDITORIAL_BASELINE_RULES,
  composeFaqPromptRules,
  composeVoiceRules,
} from "./compose-voice-rules.js";

export type PreprocessResearchBriefForVoiceOpts = {
  voice: Voice;
  topic: string;
  researchBrief: string;
  styleKitSummary?: string;
  includeFaq?: boolean;
  howToTopic?: boolean;
  subtopics?: string[];
};

export async function preprocessResearchBriefForVoice(
  opts: PreprocessResearchBriefForVoiceOpts,
): Promise<string> {
  const brief = opts.researchBrief.trim();
  if (!brief || !env.openaiApiKey) return brief;

  const ctx = resolveVoiceGenerationContext(opts.voice);
  const styleLines = buildVoiceStylePromptLines({
    brandName: ctx.brandName,
    brandMentionLevel: ctx.brandMentionLevel,
    contentProviderName: undefined,
    sourcesInPostsLevel: ctx.sourcesInPostsLevel,
    preferredPhrases: ctx.preferredPhrases,
  });

  const personaBlock = ctx.persona?.trim() ? `Persona:\n${ctx.persona.trim()}` : "";
  const styleKitBlock = opts.styleKitSummary?.trim()
    ? `\nBrand style reference (rhythm only — do not copy titles):\n${opts.styleKitSummary.trim()}`
    : "";
  const faqBlock = composeFaqPromptRules(opts.includeFaq);
  const voiceRules = composeVoiceRules(opts.voice);
  const howToBlock = opts.howToTopic
    ? `\nHow-to tutorial rules:
- Preserve step order, menu paths (e.g. Mail > Preferences), button names, file types, and platform/app names from the brief.
- Do not abstract platform-specific steps into generic advice for other email clients or tools.
- Keep subtopic-specific procedures distinct — do not merge into one generic flow.${
        opts.subtopics?.length
          ? `\nRequired subtopics (preserve their steps and platform details):\n${opts.subtopics.map((s) => `- ${s}`).join("\n")}`
          : ""
      }`
    : "";

  const systemPrompt = opts.howToTopic
    ? `Rewrite a neutral research brief into procedural briefing notes in the brand's voice.
Rules:
- Output plain text only (no markdown fences, no HTML).
- Preserve ALL facts, ordered steps, menu paths, caveats, and FAQ Q/A from the input — do not invent or drop claims.
- Remove research-brief section labels (Topic overview, Key facts, Angles to cover, Setup steps headers, etc.).
- Write as voice-shaped procedural notes: ordered steps and platform-specific actions in the brand's own person and register.
- Do not write the finished article — only briefing notes for a how-to writer.
- Do not add editorial angles, thought-leadership framing, or brand-essay sections.${howToBlock}${voiceRules}${COMPOSE_EDITORIAL_BASELINE_RULES}${faqBlock}
${styleLines.length ? `\n${styleLines.join("\n")}` : ""}`
    : `Rewrite a neutral research brief into editorial briefing notes in the brand's voice.
Rules:
- Output plain text only (no markdown fences, no HTML).
- Preserve ALL facts, stats, caveats, and FAQ Q/A content from the input — do not invent or drop claims.
- Remove research-brief section labels (Topic overview, Key facts, Angles to cover, Caveats, Open questions).
- Write as flowing editorial notes and short bullet clusters in the brand's own person and register.
- Do not write the finished article — only voice-shaped briefing notes for a writer.
- Avoid neutral industry-guide tone and survey structure.${howToBlock}${voiceRules}${COMPOSE_EDITORIAL_BASELINE_RULES}${faqBlock}
${styleLines.length ? `\n${styleLines.join("\n")}` : ""}`;

  const userPrompt = [
    `Topic: ${opts.topic.trim()}`,
    personaBlock,
    styleKitBlock,
    "",
    "Neutral research brief to rewrite:",
    brief.slice(0, env.maxWriterInputChars),
  ]
    .filter(Boolean)
    .join("\n");

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const res = await client.chat.completions.create({
    model: researchModel(),
    max_completion_tokens: env.maxTokensWriter,
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const rewritten = res.choices[0]?.message?.content?.trim();
  return rewritten && rewritten.length >= Math.min(100, brief.length * 0.3) ? rewritten : brief;
}
