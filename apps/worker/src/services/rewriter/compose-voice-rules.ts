export const COMPOSE_VOICE_RULES = `
Compose editorial voice (match brand examples — not a neutral industry guide):
- Short paragraphs (often 1–3 sentences); mix sentence length and rhythm.
- Punchy, conversational H2/H3 headings — not textbook titles (avoid "Understanding the…", "Challenges and Considerations", "Innovative Design Trends…", "Looking Ahead").
- First-person plural "we" with operator perspective: hands-on, selective, principled.
- Prefer flowing prose; use lists sparingly — never dump brief bullets as consecutive lists.
- State principles and convictions directly; avoid generic guide filler ("Let's connect and explore").
- Use principle statements where they fit ("We never…", "That rule sounds simple."). Avoid survey-of-the-field exposition.
- No duplicate H2 topics; no meta "open questions remain" closings.`;

export const COMPOSE_SBD_RHETORIC_RULES = `
Editorial rhetorical patterns (from brand style examples):
- Lead with conviction and selective operator judgment, not neutral industry overview.
- Headings should sound like editorial chapter titles, not textbook section labels.
- Closings should land with conviction — not "we invite you to discover" or "several questions remain open."`;

export function composeFaqPromptRules(includeFaq?: boolean): string {
  if (!includeFaq) {
    return "\nDo not include an FAQ, frequently asked questions, or Q&A section.";
  }
  return `
FAQ section (required — editorial format, not an industry guide dump):
- Use a punchy editorial section title from brand style examples — NOT "Your Questions Answered", "Common Questions", or "Frequently Asked Questions".
- Format each item as <h3>Question?</h3><p>Answer.</p> with short answers (1–2 sentences each).
- Cover FAQ facts from extracted narrative sections; do not invent answers.
- Do not add more than 4 FAQ items unless facts require more.`;
}

export const COMPOSE_EXPAND_FORBIDDEN_PATTERNS = `
Forbidden when expanding:
- Textbook headings: "Innovative Design Trends", "Understanding the Impact", "Looking Ahead", "Finding the Right Balance", "Designing for…"
- Meta closings: "several questions remain", "as we think about the future", "we invite you to discover"
- Duplicate H2 topics already in the article
- FAQ boilerplate titles ("Your Questions Answered", "Common Questions")`;
