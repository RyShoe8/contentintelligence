import {
  isProceduralContentFacts,
  rewriterProceduralCompletenessIssues,
  selfCritiqueResultSchema,
  stripHtmlToPlainText,
  type ContentFacts,
  type SelfCritiqueResult,
} from "@content-resourcer/db";
import type { VoiceGenerationContext } from "../../voice-generation-context.js";
import { completeJson } from "../llm/json-completion.js";

export function parseSelfCritiqueResult(raw: unknown): SelfCritiqueResult | null {
  const parsed = selfCritiqueResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function runSelfCritique(
  html: string,
  facts: ContentFacts,
  ctx: VoiceGenerationContext,
): Promise<SelfCritiqueResult> {
  const plain = stripHtmlToPlainText(html);
  const personaBlock = ctx.persona?.trim() ? `Persona: ${ctx.persona.trim()}` : "";
  const procedural = isProceduralContentFacts(facts);
  const completenessIssues = procedural ? rewriterProceduralCompletenessIssues(facts, html) : [];

  const proceduralBlock = procedural
    ? `This is a procedural how-to article. Check that EVERY section title appears and step counts match the facts JSON. Missing steps or merged sections are failures.`
    : "";

  const raw = await completeJson<unknown>({
    system: `Critique whether this article sounds human-authored for the brand.
Reply JSON only:
{"humanAuthenticity": number,"brandConsistency": number,"genericity": number,"issues": string[]}
Scores 0–100. Answer these internally:
1. Marketing copy? 2. AI-generated? 3. Affiliate spam? 4. LinkedIn fluff? 5. Opinions or just info?
humanAuthenticity: reads like a real operator wrote it.
brandConsistency: matches the stated persona/constraints.
genericity: template/AI feel (high = bad).
issues: short bullets for failures.
${proceduralBlock}`,
    user: [
      personaBlock,
      "",
      "Facts the article should reflect (JSON):",
      JSON.stringify(facts, null, 2),
      "",
      "Article text:",
      plain.slice(0, 8000),
    ]
      .filter(Boolean)
      .join("\n"),
    temperature: 0.25,
    maxTokens: 600,
  });

  const parsed = parseSelfCritiqueResult(raw);
  if (parsed) {
    return selfCritiqueResultSchema.parse({
      ...parsed,
      issues: [...new Set([...completenessIssues, ...parsed.issues])].slice(0, 12),
    });
  }

  return selfCritiqueResultSchema.parse({
    humanAuthenticity: 70,
    brandConsistency: 70,
    genericity: 40,
    issues: completenessIssues.length ? completenessIssues : ["Critique unavailable"],
  });
}
