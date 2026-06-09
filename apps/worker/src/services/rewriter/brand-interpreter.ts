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
    ? `You are a brand editor forming a lens for an article about a topic — not writing copy.
Reply with JSON only:
{"assessment": string,"qualityScore": number,"bestFor": string,"risks": string[],"caveats": string[],"opportunities": string[]}
Rules:
- assessment: how this brand would frame and judge the topic (use persona and constraints — perspective, caveats, opinions).
- qualityScore: 0–10 integer.
- bestFor: who needs this information from this brand's point of view.
- risks/caveats/opportunities: short bullets grounded in the facts and brand stance.
- The topic stays the article subject — do not center community, content strategy, or brand-as-subject meta.
- Do NOT write marketing copy or headlines.`
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
