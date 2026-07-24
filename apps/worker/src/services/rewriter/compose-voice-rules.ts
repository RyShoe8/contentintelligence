import {
  composeVoiceProfilePromptBlock,
  deriveComposeVoiceProfile,
  emptyComposeVoiceProfile,
  type ComposeStyleKitRhythm,
  type ComposeVoiceProfile,
  type Voice,
} from "@content-resourcer/db";
import type { ArticleRewriteExample } from "./types.js";

const RHYTHM_SHORT_SHARE_MIN = 0.25;

/**
 * Rhythm rules, applied only when the brand's own examples show that pattern.
 *
 * Previously this described a staccato pattern in the abstract; it now takes its numbers from
 * the measured example so a brand with long flowing paragraphs is not pushed into fragments.
 */
export function composeRhythmPromptRules(rhythm?: ComposeStyleKitRhythm): string {
  if (!rhythm) return "";
  const applies = rhythm.shortParagraphShare > RHYTHM_SHORT_SHARE_MIN || rhythm.hasFragments;
  if (!applies) return "";
  const boldLine = rhythm.hasBoldLines
    ? "\n- Bold 3-6 key statements with <strong> (not headings)."
    : "";
  const fragmentLine = rhythm.hasFragments
    ? "\n- Short fragment runs are part of this brand's rhythm; use one or two for emphasis."
    : "";
  return `
Brand rhythm (measured from this brand's style examples):
- Include short one-line paragraphs at emphasis moments (about ${Math.round(
    rhythm.shortParagraphShare * 100,
  )}% of paragraphs in the reference).${fragmentLine}${boldLine}`;
}

/**
 * Resolve the compose voice profile for a voice.
 *
 * Prefers the profile stored on the voice record (measured when the persona was generated).
 * Falls back to measuring the supplied style examples inline, then to an empty profile whose
 * rules are brand-neutral.
 */
export function resolveComposeVoiceProfile(
  voice: Voice | undefined,
  examples?: ArticleRewriteExample[],
): ComposeVoiceProfile {
  const stored = voice?.compose_voice_profile;
  if (stored && stored.sampleCount > 0) return stored;

  const html = (examples ?? []).map((ex) => ex.html ?? "").filter((h) => h.trim());
  if (html.length) return deriveComposeVoiceProfile(html);

  return emptyComposeVoiceProfile();
}

/**
 * Per-brand replacement for the former global `COMPOSE_VOICE_RULES` constant.
 *
 * The old constant hardcoded one client's style (first-person plural operator voice, staccato
 * rhythm, conviction openings) and was injected into every brand's prompts, which is why
 * unrelated brands converged on the same sound.
 */
export function composeVoiceRules(
  voice: Voice | undefined,
  examples?: ArticleRewriteExample[],
): string {
  const profile = resolveComposeVoiceProfile(voice, examples);
  return composeVoiceProfilePromptBlock(profile, {
    heading:
      profile.sampleCount > 0
        ? "Compose voice rules (measured from this brand's own published articles — match these, not a generic editorial style)"
        : "Compose voice rules (no style examples yet — take voice from the brand examples and persona below)",
  });
}

/** Brand-neutral editorial guidance that does not presume any particular house style. */
export const COMPOSE_EDITORIAL_BASELINE_RULES = `
Editorial baseline:
- Take a clear position where the facts support one; do not hedge every claim.
- Headings should read like this brand's own headings, not textbook section labels.
- The closing should land on a point, not a summary of what was already said.`;

export function composeFaqPromptRules(includeFaq?: boolean, faqHeadingRole?: string): string {
  if (!includeFaq) {
    return "\nDo not include an FAQ, frequently asked questions, or Q&A section.";
  }
  const roleLine = faqHeadingRole?.trim()
    ? `- Adapt the FAQ section H2 from this editorial role: "${faqHeadingRole.trim()}" — topic-adapted wording that makes sense over Q&A items, not verbatim.`
    : "- Use a section title in the brand's own heading style";
  return `
FAQ section (required — editorial format, not an industry guide dump):
${roleLine}
- Forbidden FAQ H2 titles: "Your Questions Answered", "Common Questions", "Frequently Asked Questions", "Curious About…", "Got Questions", "Your Questions", or any H2 ending in "?".
- Format each item as <h3>Question?</h3><p>Answer.</p> with short answers (1–2 sentences each).
- Write each answer in the brand's voice with at least one concrete specific — not a research summary.
- Cover FAQ facts from extracted narrative sections; do not invent answers.
- Do not add more than 4 FAQ items unless facts require more.`;
}

export const COMPOSE_EXPAND_FORBIDDEN_PATTERNS = `
Forbidden when expanding:
- Textbook headings: "Innovative Design Trends", "Understanding the Impact", "Looking Ahead", "Finding the Right Balance", "Designing for…"
- Meta closings: "several questions remain", "as we think about the future", "we invite you to discover"
- Duplicate H2 topics already in the article
- FAQ boilerplate titles ("Your Questions Answered", "Common Questions")`;
