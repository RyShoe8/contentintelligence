import {
  REWRITER_COMPOSE_GENERICITY_MAX,
  isComposeNarrativeFacts,
  isHybridContentFacts,
  isProceduralContentFacts,
  rewriterComposeCompletenessIssues,
  rewriterInstructionPreserveCompletenessIssues,
  rewriterProceduralCompletenessIssues,
  selfCritiqueResultSchema,
  stripHtmlToPlainText,
  writerComposeOperatorVoiceIssues,
  writerComposeReferenceLeakIssues,
  writerComposeVoiceStyleIssues,
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
  opts: {
    composeMode?: boolean;
    topic?: string;
    styleExampleExcerpt?: string;
    includeFaq?: boolean;
    knownExampleTitles?: string[];
  } = {},
): Promise<SelfCritiqueResult> {
  const plain = stripHtmlToPlainText(html);
  const personaBlock = ctx.persona?.trim() ? `Persona: ${ctx.persona.trim()}` : "";
  const hybrid = isHybridContentFacts(facts);
  const composeNarrative = isComposeNarrativeFacts(facts);
  const proceduralOnly = isProceduralContentFacts(facts);
  const deterministicIssues =
    opts.composeMode && composeNarrative
      ? [
          ...rewriterComposeCompletenessIssues(facts, html),
          ...writerComposeReferenceLeakIssues(html, opts.knownExampleTitles),
          ...writerComposeVoiceStyleIssues(html),
          ...writerComposeOperatorVoiceIssues(html),
        ]
      : hybrid
        ? rewriterInstructionPreserveCompletenessIssues(facts, html)
        : proceduralOnly
          ? rewriterProceduralCompletenessIssues(facts, html)
          : [];

  let preserveBlock = "";
  if (opts.composeMode && composeNarrative) {
    preserveBlock = `This is a topic-first compose article. Check that ALL research facts and keyDetails appear in editorial prose — but do NOT require research-brief section titles (Topic overview, Key facts, etc.) as headings. Fail if the article reads like a labeled research summary instead of brand-voice editorial.`;
  } else if (hybrid) {
    preserveBlock = `This is a hybrid article with both narrative editorial blocks and procedural how-to sections. Check that EVERY narrative section title and key points appear, and EVERY procedural section has all steps. Missing blocks or merged sections are failures.`;
  } else if (proceduralOnly) {
    preserveBlock = `This is a procedural how-to article. Check that EVERY section title appears and step counts match the facts JSON. Missing steps or merged sections are failures.`;
  }

  const topic = opts.topic?.trim();
  const faqCritiqueBlock =
    opts.composeMode && opts.includeFaq
      ? " Fail if FAQ reads like an industry guide Q&A dump (many long answers, boilerplate titles like Your Questions Answered) instead of short editorial FAQ with punchy section title."
      : "";
  const composeBlock =
    opts.composeMode && topic
      ? `This is a topic-first editorial article about "${topic}". Fail if the article is primarily about the brand/community/content strategy rather than the topic. Fail if copy is generic, neutral, or reads like a research brief outline or industry guide — brand voice must shape perspective, headings, and framing from persona and examples, not just word choice. Fail if H2/H3 headings mirror research-brief labels (Topic overview, Key facts, Angles to cover, Caveats, Open questions). Fail if paragraph rhythm does not match the brand style example (short punchy paragraphs vs long textbook blocks). Compare the article opening and heading rhythm side-by-side with the style reference — short paragraphs and "we" alone are insufficient if tone still reads like a neutral industry guide. Fail if the article copies reference chrome (Back to Blog, share buttons, publication dates) or style example post titles. If copy reads like a generic guide, FAQ survey, or copies reference metadata, brandConsistency must be below 70 even when "we" is present. Fail if genericity would exceed ${REWRITER_COMPOSE_GENERICITY_MAX} even when humanAuthenticity/brandConsistency look acceptable.${faqCritiqueBlock}`
      : "";

  const raw = await completeJson<unknown>({
    system: `Critique whether this article sounds human-authored for the brand.
Reply JSON only:
{"humanAuthenticity": number,"brandConsistency": number,"genericity": number,"issues": string[]}
Scores 0–100. Answer these internally:
1. Marketing copy? 2. AI-generated? 3. Affiliate spam? 4. LinkedIn fluff? 5. Opinions or just info?
humanAuthenticity: reads like a real operator wrote it.
brandConsistency: matches the stated persona/constraints and brand style example rhythm — not just using "we" with generic guide structure.
genericity: template/AI feel (high = bad). For compose articles, score genericity above ${REWRITER_COMPOSE_GENERICITY_MAX} when copy reads like a neutral industry guide.
issues: short bullets for failures.
${preserveBlock}${composeBlock ? `\n${composeBlock}` : ""}`,
    user: [
      topic ? `Article topic: ${topic}` : "",
      personaBlock,
      opts.styleExampleExcerpt?.trim()
        ? `\nBrand style reference (compare opening rhythm, paragraph length, and operator voice side-by-side):\n${opts.styleExampleExcerpt.trim().slice(0, 2800)}`
        : "",
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
      issues: [...new Set([...deterministicIssues, ...parsed.issues])].slice(0, 12),
    });
  }

  return selfCritiqueResultSchema.parse({
    humanAuthenticity: 70,
    brandConsistency: 70,
    genericity: 40,
    issues: deterministicIssues.length ? deterministicIssues : ["Critique unavailable"],
  });
}
