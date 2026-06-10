import type { ComposeStyleKitRhythm } from "@content-resourcer/db";

const RHYTHM_SHORT_SHARE_MIN = 0.25;

/** Staccato rhythm rules when the primary brand example uses that pattern. */
export function composeRhythmPromptRules(rhythm?: ComposeStyleKitRhythm): string {
  if (!rhythm) return "";
  const applies = rhythm.shortParagraphShare > RHYTHM_SHORT_SHARE_MIN || rhythm.hasFragments;
  if (!applies) return "";
  const boldLine = rhythm.hasBoldLines
    ? "\n- Bold 3–6 key conviction statements with <strong> (not headings)."
    : "";
  return `
Brand rhythm (match the staccato pattern from brand examples):
- Include at least 3 one-line paragraphs (under 12 words) at emphasis moments.
- Use at least one staccato fragment run for emphasis (e.g. "Too low. Too deep. Too hard.").${boldLine}`;
}

export const COMPOSE_VOICE_RULES = `
Compose editorial voice (match brand examples — not a neutral industry guide):
- Short paragraphs (often 1–3 sentences); mix sentence length and rhythm.
- Punchy, conversational H2/H3 headings — not textbook titles (avoid "Understanding the…", "Challenges and Considerations", "Innovative Design Trends…", "Looking Ahead").
- First-person plural "we" with operator perspective: hands-on, selective, principled.
- Prefer flowing prose; use lists sparingly — never dump brief bullets as consecutive lists.
- State principles and convictions directly; avoid generic guide filler ("Let's connect and explore").
- Use principle statements where they fit ("We never…", "That rule sounds simple."). Avoid survey-of-the-field exposition.
- No duplicate H2 topics; no meta "open questions remain" closings.
- Never copy example post titles, publication dates, navigation, share buttons, or breadcrumb text from brand references — imitate rhythm and rhetorical patterns only.`;

export const COMPOSE_SBD_RHETORIC_RULES = `
Editorial rhetorical patterns (from brand style examples):
- Lead with conviction and selective operator judgment, not neutral industry overview.
- Headings should sound like editorial chapter titles, not textbook section labels.
- Closings should land with conviction — not "we invite you to discover" or "several questions remain open."`;

export function composeFaqPromptRules(includeFaq?: boolean, faqHeadingRole?: string): string {
  if (!includeFaq) {
    return "\nDo not include an FAQ, frequently asked questions, or Q&A section.";
  }
  const roleLine = faqHeadingRole?.trim()
    ? `- Adapt the FAQ section H2 from this editorial role: "${faqHeadingRole.trim()}" — topic-adapted wording that makes sense over Q&A items, not verbatim.`
    : "- Use a punchy editorial section title from brand style examples";
  return `
FAQ section (required — editorial format, not an industry guide dump):
${roleLine}
- Forbidden FAQ H2 titles: "Your Questions Answered", "Common Questions", "Frequently Asked Questions", "Curious About…", "Got Questions", "Your Questions", or any H2 ending in "?".
- Format each item as <h3>Question?</h3><p>Answer.</p> with short answers (1–2 sentences each).
- Write each answer in operator we-voice with at least one concrete specific — not a research summary.
- Cover FAQ facts from extracted narrative sections; do not invent answers.
- Do not add more than 4 FAQ items unless facts require more.`;
}

export const COMPOSE_EXPAND_FORBIDDEN_PATTERNS = `
Forbidden when expanding:
- Textbook headings: "Innovative Design Trends", "Understanding the Impact", "Looking Ahead", "Finding the Right Balance", "Designing for…"
- Meta closings: "several questions remain", "as we think about the future", "we invite you to discover"
- Duplicate H2 topics already in the article
- FAQ boilerplate titles ("Your Questions Answered", "Common Questions")`;
