import { z } from "zod";
import { sanitizeArticleHtmlForLearning } from "./sanitize-article-html.js";
import { stripHtmlToPlainText, writerHtmlParagraphs } from "./writer-validation.js";

/**
 * Per-brand compose voice profile.
 *
 * This replaces the previously global `COMPOSE_VOICE_RULES` / `COMPOSE_SBD_RHETORIC_RULES`
 * prompt constants, which encoded one client's house style ("first-person plural we with
 * operator perspective", "staccato", "operator conviction") and were injected into every
 * brand's generation prompts. That pushed every voice toward the same style regardless of
 * what its own published writing looked like.
 *
 * The profile is measured from the voice's own style examples, so the rules handed to the
 * model describe that brand rather than a fixed target.
 */

export const VOICE_PERSONS = ["first_plural", "first_singular", "second", "third"] as const;
export const voicePersonSchema = z.enum(VOICE_PERSONS);
export type VoicePerson = z.infer<typeof voicePersonSchema>;

export const HEADING_STYLES = ["punchy", "descriptive", "question", "textbook"] as const;
export const headingStyleSchema = z.enum(HEADING_STYLES);
export type HeadingStyle = z.infer<typeof headingStyleSchema>;

const SHORT_PARAGRAPH_WORDS = 12;

export const composeVoiceProfileSchema = z.object({
  person: voicePersonSchema.default("third"),
  /** Mean words per body paragraph. */
  avgParagraphWords: z.number().min(0).max(400).default(0),
  /** Share (0-1) of paragraphs at or under 12 words. */
  shortParagraphShare: z.number().min(0).max(1).default(0),
  headingStyle: headingStyleSchema.default("descriptive"),
  headingAvgWords: z.number().min(0).max(40).default(0),
  /** Share (0-1) of headings phrased as questions. */
  headingQuestionShare: z.number().min(0).max(1).default(0),
  usesFragments: z.boolean().default(false),
  usesBoldEmphasis: z.boolean().default(false),
  /** Share (0-1) of block elements that are lists. */
  listShare: z.number().min(0).max(1).default(0),
  /** Verbatim heading samples from the brand's own writing. */
  headingSamples: z.array(z.string()).max(8).default([]),
  /** Number of style examples the profile was measured from. */
  sampleCount: z.number().int().min(0).default(0),
  derivedAt: z.coerce.date().optional(),
});

export type ComposeVoiceProfile = z.infer<typeof composeVoiceProfileSchema>;

export function emptyComposeVoiceProfile(): ComposeVoiceProfile {
  return composeVoiceProfileSchema.parse({});
}

const PERSON_LABELS: Record<VoicePerson, string> = {
  first_plural: "first-person plural",
  first_singular: "first-person singular",
  second: "second person",
  third: "third person",
};

/** Human-readable person label for warnings and retry issues. */
export function voicePersonLabel(person: VoicePerson): string {
  return PERSON_LABELS[person];
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function isListOnlyParagraph(html: string): boolean {
  const trimmed = html.trim();
  return /^<(ul|ol)\b/i.test(trimmed) || /^<li\b/i.test(trimmed);
}

function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const re = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = stripHtmlToPlainText(match[1] ?? "").trim();
    if (text.length >= 3 && text.length <= 120) headings.push(text);
  }
  return headings;
}

/**
 * Section labels that read as textbook/survey structure.
 *
 * This is a genuinely brand-neutral list — it describes generic article scaffolding rather
 * than any particular client's subject matter.
 */
const TEXTBOOK_HEADING_RE =
  /^(understanding|introduction to|overview of|the (?:impact|importance|role|benefits) of|benefits of|challenges|considerations|key takeaways|looking ahead|final thoughts|in conclusion|conclusion)\b/i;

export function detectPerson(plain: string): VoicePerson {
  const total = words(plain).length;
  if (total < 20) return "third";
  const count = (re: RegExp) => (plain.match(re) ?? []).length;
  const firstPlural = count(/\b(?:we|our|ours|us)\b/gi);
  const firstSingular = count(/\b(?:i|my|mine|me)\b/g);
  const second = count(/\b(?:you|your|yours)\b/gi);

  const ranked: [VoicePerson, number][] = [
    ["first_plural", firstPlural],
    ["first_singular", firstSingular],
    ["second", second],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  const [topPerson, topCount] = ranked[0]!;
  // Require a real signal, not one stray pronoun in a long article.
  const density = topCount / total;
  return density >= 0.004 ? topPerson : "third";
}

export function detectHeadingStyle(headings: string[]): {
  style: HeadingStyle;
  avgWords: number;
  questionShare: number;
} {
  if (!headings.length) {
    return { style: "descriptive", avgWords: 0, questionShare: 0 };
  }
  const wordCounts = headings.map((h) => words(h).length);
  const avgWords = wordCounts.reduce((a, b) => a + b, 0) / headings.length;
  const questionShare = headings.filter((h) => h.trim().endsWith("?")).length / headings.length;
  const textbookShare = headings.filter((h) => TEXTBOOK_HEADING_RE.test(h.trim())).length /
    headings.length;

  if (textbookShare >= 0.3) return { style: "textbook", avgWords, questionShare };
  if (questionShare >= 0.3) return { style: "question", avgWords, questionShare };
  if (avgWords <= 5) return { style: "punchy", avgWords, questionShare };
  return { style: "descriptive", avgWords, questionShare };
}

function paragraphHasFragmentRun(plain: string): boolean {
  const sentences = plain.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return sentences.some((s) => {
    const n = words(s).length;
    return n >= 1 && n <= 4 && /[.!?]$/.test(s);
  });
}

/** Measure a compose voice profile from one or more style example HTML documents. */
export function deriveComposeVoiceProfile(htmlDocs: string[]): ComposeVoiceProfile {
  const docs = htmlDocs.map((h) => sanitizeArticleHtmlForLearning(h ?? "")).filter((h) => h.trim());
  if (!docs.length) return emptyComposeVoiceProfile();

  const allParagraphs: string[] = [];
  const allHeadings: string[] = [];
  let listBlocks = 0;
  let boldOutsideHeadings = false;

  for (const doc of docs) {
    allHeadings.push(...extractHeadings(doc));

    const paragraphs = writerHtmlParagraphs(doc);
    for (const p of paragraphs) {
      if (isListOnlyParagraph(p)) {
        listBlocks++;
        continue;
      }
      const plain = stripHtmlToPlainText(p).trim();
      if (plain.length > 0) allParagraphs.push(plain);
    }
    listBlocks += (doc.match(/<(?:ul|ol)\b/gi) ?? []).length;

    const bodyWithoutHeadings = doc.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, "");
    if (/<(?:strong|b)\b/i.test(bodyWithoutHeadings)) boldOutsideHeadings = true;
  }

  if (!allParagraphs.length) return emptyComposeVoiceProfile();

  const paragraphWordCounts = allParagraphs.map((p) => words(p).length);
  const avgParagraphWords =
    paragraphWordCounts.reduce((a, b) => a + b, 0) / paragraphWordCounts.length;
  const shortParagraphShare =
    paragraphWordCounts.filter((n) => n <= SHORT_PARAGRAPH_WORDS).length /
    paragraphWordCounts.length;

  const heading = detectHeadingStyle(allHeadings);
  const plainBody = allParagraphs.join(" ");
  const totalBlocks = allParagraphs.length + listBlocks;

  return composeVoiceProfileSchema.parse({
    person: detectPerson(plainBody),
    avgParagraphWords: Math.round(avgParagraphWords * 10) / 10,
    shortParagraphShare: Math.round(shortParagraphShare * 100) / 100,
    headingStyle: heading.style,
    headingAvgWords: Math.round(heading.avgWords * 10) / 10,
    headingQuestionShare: Math.round(heading.questionShare * 100) / 100,
    usesFragments: allParagraphs.some(paragraphHasFragmentRun),
    usesBoldEmphasis: boldOutsideHeadings,
    listShare: totalBlocks ? Math.round((listBlocks / totalBlocks) * 100) / 100 : 0,
    headingSamples: [...new Set(allHeadings)].slice(0, 8),
    sampleCount: docs.length,
    derivedAt: new Date(),
  });
}

const PERSON_RULE: Record<VoicePerson, string> = {
  first_plural: 'Write in first-person plural ("we", "our") — the brand speaks as a group.',
  first_singular: 'Write in first-person singular ("I", "my") — the brand speaks as one author.',
  second: 'Address the reader directly in second person ("you", "your").',
  third: "Write in third person. Do not introduce a first-person narrator the brand does not use.",
};

const HEADING_RULE: Record<HeadingStyle, string> = {
  punchy: "Headings are short (about 2-5 words) and declarative.",
  descriptive: "Headings are descriptive phrases (about 5-9 words) that name the section's subject.",
  question: "Headings are phrased as questions.",
  textbook:
    "Headings use conventional section labels. Keep them plain and informative rather than clever.",
};

/**
 * Brand-neutral rules that apply to any voice.
 *
 * Deliberately excludes anything about person, rhythm, conviction, or heading tone — those are
 * measured per brand above.
 */
const BASELINE_RULES = [
  "Vary sentence length; avoid a uniform cadence.",
  "Do not restate the brief's section labels as headings.",
  "No duplicate heading topics.",
  'No meta closings ("questions remain", "as we look ahead", "we invite you to explore").',
  "Never copy titles, publication dates, navigation, share buttons, or breadcrumbs from the brand reference articles — imitate prose patterns only.",
];

/** Render the profile as prompt rule lines describing this specific brand. */
export function composeVoiceProfileRules(profile: ComposeVoiceProfile): string[] {
  if (profile.sampleCount === 0) {
    return [
      "Match the voice of the brand examples provided.",
      ...BASELINE_RULES,
    ];
  }

  const rules: string[] = [PERSON_RULE[profile.person]];

  const avg = Math.round(profile.avgParagraphWords);
  if (avg > 0) {
    const low = Math.max(8, Math.round(avg * 0.6));
    const high = Math.round(avg * 1.5);
    rules.push(
      `Paragraphs average about ${avg} words in this brand's writing — keep most between ${low} and ${high}.`,
    );
  }

  if (profile.shortParagraphShare >= 0.2) {
    rules.push(
      `About ${Math.round(profile.shortParagraphShare * 100)}% of this brand's paragraphs are a single short line — use that rate for emphasis.`,
    );
  } else if (profile.shortParagraphShare <= 0.05) {
    rules.push(
      "This brand rarely uses one-line paragraphs — do not break the article into staccato fragments.",
    );
  }

  rules.push(HEADING_RULE[profile.headingStyle]);
  if (profile.headingStyle !== "question" && profile.headingQuestionShare < 0.1) {
    rules.push("Do not phrase headings as questions — this brand does not.");
  }

  if (profile.usesFragments) {
    rules.push("Sentence fragments are part of this brand's rhythm; use them sparingly for emphasis.");
  } else {
    rules.push("Write in complete sentences — this brand does not use fragment runs.");
  }

  if (profile.usesBoldEmphasis) {
    rules.push("Bold a small number of key statements with <strong>, as this brand does.");
  } else {
    rules.push("Do not bold text inside paragraphs — this brand does not.");
  }

  if (profile.listShare <= 0.05) {
    rules.push("This brand writes in prose and rarely uses bullet lists — avoid them.");
  } else if (profile.listShare >= 0.25) {
    rules.push("Bullet lists are common in this brand's writing — use them where they fit.");
  } else {
    rules.push("Use bullet lists sparingly; this brand favours prose.");
  }

  if (profile.headingSamples.length >= 2) {
    rules.push(
      `Headings from this brand's own articles, for tone reference only: ${profile.headingSamples
        .slice(0, 5)
        .map((h) => `"${h}"`)
        .join(", ")}.`,
    );
  }

  return [...rules, ...BASELINE_RULES];
}

/** Prompt block form of the per-brand rules. */
export function composeVoiceProfilePromptBlock(
  profile: ComposeVoiceProfile | undefined,
  opts?: { heading?: string },
): string {
  const resolved = profile ?? emptyComposeVoiceProfile();
  const heading =
    opts?.heading ??
    (resolved.sampleCount > 0
      ? "Voice rules measured from this brand's own published articles"
      : "Voice rules");
  const lines = composeVoiceProfileRules(resolved).map((r) => `- ${r}`);
  return `\n${heading}:\n${lines.join("\n")}`;
}
