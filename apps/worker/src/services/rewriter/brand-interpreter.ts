import {
  brandInterpretationSchema,
  type BrandInterpretation,
  type ContentFacts,
} from "@content-resourcer/db";
import type { VoiceGenerationContext } from "../../voice-generation-context.js";
import { formatConstraintsForPrompt } from "../constraints/assemble-generation-constraints.js";
import { completeJson } from "../llm/json-completion.js";

export function parseBrandInterpretation(raw: unknown): BrandInterpretation | null {
  const parsed = brandInterpretationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function interpretBrand(
  facts: ContentFacts,
  ctx: VoiceGenerationContext,
  opts: { composeMode?: boolean; topic?: string } = {},
): Promise<BrandInterpretation> {
  const personaBlock = ctx.persona?.trim()
    ? `Brand persona:\n${ctx.persona.trim()}`
    : "";
  const constraintsBlock = ctx.constraints
    ? `Brand constraints (JSON):\n${formatConstraintsForPrompt(ctx.constraints)}`
    : "";

  const topic = opts.topic?.trim();
  const systemPrompt = opts.composeMode
    ? `You are an editorial strategist forming a neutral lens for an article about a topic — not writing copy.
Reply with JSON only:
{"assessment": string,"qualityScore": number,"bestFor": string,"risks": string[],"caveats": string[],"opportunities": string[]}
Rules:
- assessment: editorial framing for an authoritative article about the topic (audience, nuance, caveats).
- qualityScore: 0–10 integer.
- bestFor: who needs this information.
- risks/caveats/opportunities: short neutral bullets grounded in the facts.
- Do NOT write marketing copy, community engagement advice, or brand-as-subject framing.`
    : `You are a brand editor forming an opinion about content facts — not writing copy.
Reply with JSON only:
{"assessment": string,"qualityScore": number,"bestFor": string,"risks": string[],"caveats": string[],"opportunities": string[]}
Rules:
- assessment: how this brand would judge the offer/topic (plain, specific).
- qualityScore: 0–10 integer.
- bestFor: who this is actually for.
- risks/caveats/opportunities: short neutral bullets.
- Do NOT write marketing copy or headlines.`;

  const raw = await completeJson<unknown>({
    system: systemPrompt,
    user: [
      topic ? `Article topic: ${topic}` : "",
      personaBlock,
      constraintsBlock,
      "",
      "Extracted facts (JSON):",
      JSON.stringify(facts, null, 2),
    ]
      .filter(Boolean)
      .join("\n"),
    temperature: 0.35,
    maxTokens: 900,
  });

  const parsed = parseBrandInterpretation(raw);
  if (parsed) return parsed;

  return brandInterpretationSchema.parse({
    assessment: "Standard promotional value",
    qualityScore: 5,
    bestFor: "general audience",
    risks: [],
    caveats: ["Verify terms before acting"],
    opportunities: [],
  });
}
