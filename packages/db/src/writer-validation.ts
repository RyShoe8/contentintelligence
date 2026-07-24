import { z } from "zod";
import { composeArticleTypeSchema, type ComposeArticleType } from "./compose-article-type.js";
import { productUpdateBriefSchema } from "./product-update.js";
import { composeReferenceLeakPlainTextIssues } from "./sanitize-article-html.js";

export { composeArticleTypeSchema, type ComposeArticleType } from "./compose-article-type.js";
export { isComposeHowToTopic, resolveComposeArticleType, hasEditorialResearchBriefHeaders } from "./compose-article-type.js";

export const WRITER_LINK_MAX = 5;
export const WRITER_REFERENCE_URL_MAX = 15;
export const WRITER_SOURCE_MIN_CHARS = 100;
export const WRITER_SOURCE_MAX_CHARS = 32_000;
export const WRITER_TOPIC_MIN_CHARS = 10;
export const WRITER_TOPIC_MAX_CHARS = 500;
export const WRITER_LINK_LABEL_MAX = 80;
export const WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT = 3;
export const WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT = 5;
export const WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT = 10;
export const WRITER_WEB_SEARCH_MAX_RESULTS_LIMIT = 15;
export const WRITER_ARTICLE_DEPTH_DEFAULT = 50;
export const WRITER_SUBTOPIC_MAX = 8;
export const WRITER_SUBTOPIC_MIN_CHARS = 3;
export const WRITER_SUBTOPIC_MAX_CHARS = 200;

export type WriterArticleDepthGuidance = {
  label: string;
  minWords: number;
  maxWords: number;
  researchBriefMinWords: number;
  researchBriefMaxWords: number;
  reconstructionPrompt: string;
  researchBriefPrompt: string;
};

export function writerArticleDepthGuidance(depth: number): WriterArticleDepthGuidance {
  const d = Math.min(100, Math.max(0, Math.round(depth)));
  if (d <= 25) {
    return {
      label: "Overview",
      minWords: 700,
      maxWords: 1000,
      researchBriefMinWords: 400,
      researchBriefMaxWords: 800,
      researchBriefPrompt: "roughly 400–800 words of briefing content",
      reconstructionPrompt:
        "Write a concise overview article of about 700–1,000 words. Use 3–4 H2 sections. Cover essentials without filler.",
    };
  }
  if (d <= 50) {
    return {
      label: "Standard",
      minWords: 1200,
      maxWords: 1800,
      researchBriefMinWords: 800,
      researchBriefMaxWords: 1200,
      researchBriefPrompt: "roughly 800–1,200 words of briefing content",
      reconstructionPrompt:
        "Write a standard-length article of about 1,200–1,800 words. Use 4–6 H2 sections with substantive paragraphs under each.",
    };
  }
  if (d <= 75) {
    return {
      label: "In-depth",
      minWords: 2000,
      maxWords: 2800,
      researchBriefMinWords: 1200,
      researchBriefMaxWords: 1800,
      researchBriefPrompt: "roughly 1,200–1,800 words of briefing content",
      reconstructionPrompt:
        "Write an in-depth article of about 2,000–2,800 words. Use 5–8 H2 sections. Expand key points with examples, nuance, and practical detail.",
    };
  }
  return {
    label: "Comprehensive",
    minWords: 3000,
    maxWords: 4500,
    researchBriefMinWords: 1800,
    researchBriefMaxWords: 2500,
    researchBriefPrompt: "roughly 1,800–2,500 words of briefing content",
    reconstructionPrompt:
      "Write a comprehensive, highly informative article of about 3,000–4,500 words. Use 6–10 H2 sections. Thoroughly develop each theme with evidence, examples, caveats, and actionable detail.",
  };
}

export function writerArticleDepthLabel(depth: number): string {
  return writerArticleDepthGuidance(depth).label;
}

export function writerComposeFaqCountGuidance(depth: number): { min: number; max: number } {
  const d = Math.min(100, Math.max(0, Math.round(depth)));
  if (d <= 25) return { min: 3, max: 4 };
  if (d <= 50) return { min: 4, max: 6 };
  if (d <= 75) return { min: 5, max: 7 };
  return { min: 6, max: 8 };
}

export type WriterComposeResearchConfig = {
  maxResearchQuestions: number;
  sectionBatchSize: number;
  minCitationsPerSection: number;
  maxSearchQueries: number;
  gapFillPass: boolean;
};

export function writerComposeResearchConfig(articleDepth: number): WriterComposeResearchConfig {
  const d = Math.min(100, Math.max(0, Math.round(articleDepth)));
  if (d <= 25) {
    return {
      maxResearchQuestions: 6,
      sectionBatchSize: 2,
      minCitationsPerSection: 1,
      maxSearchQueries: 3,
      gapFillPass: false,
    };
  }
  if (d <= 50) {
    return {
      maxResearchQuestions: 8,
      sectionBatchSize: 2,
      minCitationsPerSection: 2,
      maxSearchQueries: 4,
      gapFillPass: false,
    };
  }
  if (d <= 75) {
    return {
      maxResearchQuestions: 10,
      sectionBatchSize: 1,
      minCitationsPerSection: 2,
      maxSearchQueries: 5,
      gapFillPass: false,
    };
  }
  return {
    maxResearchQuestions: 12,
    sectionBatchSize: 1,
    minCitationsPerSection: 3,
    maxSearchQueries: 5,
    gapFillPass: true,
  };
}

const COMPOSE_TOPIC_DRIFT_META_PHRASES = [
  "creating engaging content",
  "fostering community",
  "community engagement",
  "content strategy",
  "encouraging community",
  "promoting the brand",
  "our community",
  "the community",
] as const;

function countTermMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

/** Deterministic flags when compose article centers brand/community over the topic. */
export function writerComposeTopicDriftIssues(
  html: string,
  topic: string,
  brandName?: string,
): string[] {
  const plain = stripHtmlToPlainText(html).toLowerCase();
  const issues: string[] = [];
  const topicWords = topic
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const topicHits = topicWords.reduce(
    (sum, word) => sum + countTermMatches(plain, new RegExp(`\\b${word}\\b`, "g")),
    0,
  );

  const brand = brandName?.trim();
  const brandHits = brand
    ? countTermMatches(plain, new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"))
    : 0;

  for (const phrase of COMPOSE_TOPIC_DRIFT_META_PHRASES) {
    if (plain.includes(phrase)) {
      issues.push(`Article contains meta/community framing ("${phrase}") instead of topic coverage`);
    }
  }

  if (brand && brandHits >= 3 && brandHits > topicHits / 2) {
    issues.push(
      `Article mentions "${brand}" too often relative to the topic — keep the brand as voice, not the subject`,
    );
  }

  const communityHits = countTermMatches(plain, /\bcommunity\b/g);
  if (communityHits >= 3 && communityHits > Math.max(2, topicHits / 4)) {
    issues.push("Article focuses on community rather than the topic");
  }

  return [...new Set(issues)].slice(0, 6);
}

const COMPOSE_TOPIC_SPECIFICITY_STOPWORDS = new Set([
  "your",
  "email",
  "signature",
  "signatures",
  "setup",
  "guide",
  "how",
  "with",
  "the",
  "and",
  "for",
  "from",
  "into",
  "using",
  "create",
  "add",
  "that",
  "this",
  "about",
  "step",
  "steps",
]);

const COMPOSE_GENERIC_HOWTO_HEADING_RES = [
  /^understanding (the )?/i,
  /^what (is|are) /i,
  /^why (you should|your)/i,
  /^why .+ matters/i,
  /^best practices/i,
  /^introduction to/i,
  /^email (client|signature)/i,
  /^getting started with email/i,
  /^setting the stage/i,
  /^final touches/i,
  /^crafting your/i,
  /^navigating /i,
] as const;

function extractComposeSpecificityTerms(topic: string, subtopics?: string[]): string[] {
  const terms = new Set<string>();
  const sources = [topic, ...(subtopics ?? [])];

  for (const src of sources) {
    const lower = src.toLowerCase();
    for (const compound of lower.match(/\b(html file|apple mail|\.html)\b/g) ?? []) {
      terms.add(compound);
    }
    for (const word of lower.split(/\W+/)) {
      if (word.length > 3 && !COMPOSE_TOPIC_SPECIFICITY_STOPWORDS.has(word)) {
        terms.add(word);
      }
    }
  }

  return [...terms];
}

/** Flags when compose how-to output drifts generic or omits platform/subtopic terms. */
export function writerComposeTopicSpecificityIssues(
  html: string,
  topic: string,
  subtopics?: string[],
): string[] {
  const plain = stripHtmlToPlainText(html).toLowerCase();
  const requiredTerms = extractComposeSpecificityTerms(topic, subtopics);
  const issues: string[] = [];

  for (const term of requiredTerms) {
    if (!plain.includes(term)) {
      issues.push(`Article missing topic-specific term "${term}" from the subject or subtopics`);
    }
  }

  for (const sub of subtopics ?? []) {
    const subTerms = sub
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !COMPOSE_TOPIC_SPECIFICITY_STOPWORDS.has(w));
    if (subTerms.length > 0 && !subTerms.some((term) => plain.includes(term))) {
      issues.push(`Article does not cover subtopic "${sub}"`);
    }
  }

  const headingRe = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let genericHeadingCount = 0;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const text = stripHtmlToPlainText(match[1] ?? "").trim();
    if (text && COMPOSE_GENERIC_HOWTO_HEADING_RES.some((re) => re.test(text))) {
      genericHeadingCount++;
    }
  }

  const platformTerms = requiredTerms.filter((t) => !COMPOSE_TOPIC_SPECIFICITY_STOPWORDS.has(t));
  const hasPlatformMention = platformTerms.some((term) => plain.includes(term));
  if (genericHeadingCount >= 2 && !hasPlatformMention) {
    issues.push(
      "Article reads as a generic guide with survey-style headings instead of platform-specific steps",
    );
  }

  return [...new Set(issues)].slice(0, 6);
}

/** Flags when how-to compose output lacks ordered steps or uses essay-style headings. */
export function writerComposeHowToStructureIssues(html: string, topic: string): string[] {
  const issues: string[] = [];
  const plain = stripHtmlToPlainText(html).toLowerCase();

  const olMatches = [...html.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi)];
  let maxListItems = 0;
  for (const match of olMatches) {
    const items = [...(match[1] ?? "").matchAll(/<li\b/gi)].length;
    if (items > maxListItems) maxListItems = items;
  }
  if (maxListItems < 3) {
    issues.push(
      "How-to article must include at least one ordered list with 3+ steps — not essay-only sections",
    );
  }

  const headingRe = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const text = stripHtmlToPlainText(match[1] ?? "").trim();
    if (text && COMPOSE_GENERIC_HOWTO_HEADING_RES.some((re) => re.test(text))) {
      issues.push(`How-to article uses generic essay heading "${text}" instead of procedural sections`);
    }
  }

  const platformTerms = extractComposeSpecificityTerms(topic);
  const hasPlatformMention = platformTerms.some((term) => plain.includes(term));
  if (!hasPlatformMention && platformTerms.length > 0) {
    issues.push(
      `How-to article missing platform-specific terms from topic (${platformTerms.slice(0, 3).join(", ")})`,
    );
  }

  return [...new Set(issues)].slice(0, 6);
}

/** Flags when brand mention level requires the brand name in the article body. */
export function writerComposeBrandMentionIssues(
  html: string,
  brandName: string | undefined,
  level: number | undefined,
): string[] {
  const name = brandName?.trim();
  if (!name) return [];

  const l = Math.max(0, Math.min(100, Math.round(level ?? 50)));
  if (l === 0) return [];

  const plain = stripHtmlToPlainText(html);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentions = (plain.match(new RegExp(`\\b${escaped}\\b`, "gi")) ?? []).length;

  if (l >= 50 && mentions < 1) {
    return [`Brand name "${name}" must appear at least once (mention level ${l})`];
  }
  if (l >= 75 && mentions < 2) {
    return [`Brand name "${name}" must appear at least twice (mention level ${l})`];
  }
  return [];
}

/** Flags repeated FAQ-style or duplicate headings in how-to compose output. */
export function writerComposeDuplicateSectionIssues(
  html: string,
  articleType?: ComposeArticleType,
  includeFaq?: boolean,
): string[] {
  if (articleType !== "how_to") return [];

  const issues: string[] = [];
  const headings: string[] = [];
  const headingRe = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const text = stripHtmlToPlainText(match[1] ?? "").trim();
    if (text) headings.push(text);
  }

  const seen = new Map<string, number>();
  for (const h of headings) {
    const key = h.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      issues.push(`Duplicate section heading "${key}" appears ${count} times`);
    }
  }

  if (includeFaq) {
    const faqSectionIdx = headings.findIndex((h) =>
      /^(faq|frequently asked questions)$/i.test(h),
    );
    if (faqSectionIdx >= 0) {
      const questionHeadingsBeforeFaq = headings
        .slice(0, faqSectionIdx)
        .filter((h) => h.endsWith("?"));
      if (questionHeadingsBeforeFaq.length >= 2) {
        issues.push(
          "FAQ-style question headings appear in the body before the FAQ section — keep Q&A only in the structured FAQ",
        );
      }
    }
  }

  return [...new Set(issues)].slice(0, 4);
}

const COMPOSE_BRIEF_HEADING_RE =
  /^(topic overview|key facts|angles to cover|angles|caveats|faq|open questions|weak evidence|caveats and counterpoints|frequently asked questions)$/i;

/** Flags when compose output mirrors research-brief section labels as headings. */
export function writerComposeBriefOutlineIssues(html: string): string[] {
  const headingRe = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  const issues: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const text = stripHtmlToPlainText(match[1] ?? "").trim();
    if (text && COMPOSE_BRIEF_HEADING_RE.test(text)) {
      issues.push(
        `Article uses research-brief section heading "${text}" instead of editorial headings`,
      );
    }
  }
  return [...new Set(issues)].slice(0, 6);
}

const COMPOSE_TEXTBOOK_HEADING_RES = [
  /^understanding the\b/i,
  /^exploring the\b/i,
  /^challenges and considerations/i,
  /\binnovative\b.*\btrends\b/i,
  /^looking ahead\b/i,
  /^your questions answered\b/i,
  /\bimpact of\b/i,
  /^finding the right balance\b/i,
  /^designing for\b/i,
  /^common questions addressed/i,
  /^key features of\b/i,
  /^design essentials/i,
  /^what matters most\b/i,
  /\btrends shaping\b/i,
  /^embracing nature\b/i,
  /^tackling design challenges\b/i,
  /^independence matters\b/i,
  /got questions/i,
  /we(?:'|’)ve got answers/i,
  /we've got answers/i,
  /^curious about\b/i,
  /^shaping the\b/i,
  /^embracing\b/i,
  /^designing with\b/i,
  /\bquestions\?$/i,
  /^rethinking\b/i,
  /\bin action$/i,
  /^our commitment to\b/i,
];

const COMPOSE_GENERIC_GUIDE_PHRASES = [
  "comprehensive guidelines",
  "landscape of",
  "designers and planners must",
  "let's connect and explore",
  "let us work together",
  "in today's landscape",
  "it is essential to",
  "plays a crucial role",
  "research has shown",
  "it is important to",
  "we invite you to",
  "several questions remain",
  "as we think about the future",
  "enhance comfort and safety",
  "significantly enhances",
  "notable trend is",
  "when designing for",
  "quality of life",
  "fosters engagement",
  "well-being",
  "seamlessly",
  "enhances comfort",
  "thoughtful integration",
  "promoting their",
  "overall quality",
  "social interaction",
  "mental well-being",
  "physical health and mental",
  "foster connections",
  "holistic wellness",
  "reach out",
  "make a difference",
  "shaping the future",
  "embracing",
  "crafting welcoming",
  "designing with residents",
  "curious about",
  "fosters community engagement",
  "pave the way",
  "speak volumes",
  "go hand in hand",
  "cater to the whole person",
  "isn't just a checkbox",
  "boast",
];

const COMPOSE_MAX_AVG_PARAGRAPH_WORDS = 55;
const COMPOSE_MAX_PARAGRAPH_WORDS = 65;
const COMPOSE_MAX_PARAGRAPH_SENTENCES = 4;
const COMPOSE_MAX_CONSECUTIVE_LIST_BLOCKS = 3;
const COMPOSE_FAQ_MIN_QUESTION_BLOCKS = 5;
const COMPOSE_FAQ_MAX_ANSWER_WORDS = 35;

function countSentences(text: string): number {
  const plain = stripHtmlToPlainText(text).trim();
  if (!plain) return 0;
  const parts = plain.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return Math.max(1, parts.length);
}

/** Flags generic guide tone vs brand editorial voice in compose output. */
export function writerComposeVoiceStyleIssues(html: string): string[] {
  const issues: string[] = [];
  const plain = stripHtmlToPlainText(html).toLowerCase();

  const headingRe = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const text = stripHtmlToPlainText(match[1] ?? "").trim();
    if (text && COMPOSE_TEXTBOOK_HEADING_RES.some((re) => re.test(text))) {
      issues.push(`Textbook-style heading "${text}" — use punchy editorial headings instead`);
    }
  }

  const listParts = html.split(/(?=<(?:p|h[1-6]|ul|ol)\b)/i);
  let consecutiveLists = 0;
  let maxConsecutiveLists = 0;
  for (const part of listParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (/^<(ul|ol)\b/i.test(trimmed)) {
      consecutiveLists++;
      maxConsecutiveLists = Math.max(maxConsecutiveLists, consecutiveLists);
    } else {
      consecutiveLists = 0;
    }
  }
  if (maxConsecutiveLists >= COMPOSE_MAX_CONSECUTIVE_LIST_BLOCKS) {
    issues.push("Too many consecutive bullet/list blocks — convert to flowing prose");
  }

  const paragraphs = writerHtmlParagraphs(html);
  for (const p of paragraphs) {
    const words = stripHtmlToPlainText(p).split(/\s+/).filter(Boolean).length;
    const sentences = countSentences(p);
    if (words > COMPOSE_MAX_PARAGRAPH_WORDS) {
      issues.push(`Paragraph has ${words} words — shorten to 1–3 sentences (max ${COMPOSE_MAX_PARAGRAPH_WORDS} words)`);
      break;
    }
    if (sentences > COMPOSE_MAX_PARAGRAPH_SENTENCES) {
      issues.push(
        `Paragraph has ${sentences} sentences — shorten to match brand style (often 1–3 sentences)`,
      );
      break;
    }
  }

  if (paragraphs.length >= 4) {
    const totalWords = paragraphs.reduce(
      (sum, p) => sum + stripHtmlToPlainText(p).split(/\s+/).filter(Boolean).length,
      0,
    );
    const avg = totalWords / paragraphs.length;
    if (avg > COMPOSE_MAX_AVG_PARAGRAPH_WORDS) {
      issues.push(
        `Paragraphs average ${Math.round(avg)} words — shorten to match brand style (often 1–3 sentences)`,
      );
    }
  }

  for (const phrase of COMPOSE_GENERIC_GUIDE_PHRASES) {
    if (plain.includes(phrase)) {
      issues.push(`Generic guide phrase detected ("${phrase}")`);
    }
  }

  return [...new Set(issues)].slice(0, 6);
}

export type ComposeHardVoiceOpts = {
  includeFaq?: boolean;
  knownExampleTitles?: string[];
  faqItems?: { question: string; answer: string }[];
  articleType?: ComposeArticleType;
  topic?: string;
  brandName?: string;
  brandMentionLevel?: number;
};

/** Deterministic compose blockers that must be retried before shipping. */
export function writerComposeHardVoiceIssues(
  html: string,
  opts: ComposeHardVoiceOpts = {},
): string[] {
  return [
    ...writerComposeVoiceStyleIssues(html),
    ...writerComposeBriefOutlineIssues(html),
    ...writerComposeSectionRoleIssues(html),
    ...writerComposeReferenceLeakIssues(html, opts.knownExampleTitles),
    ...(opts.includeFaq ? writerComposeFaqStyleIssues(html, opts.faqItems ?? []) : []),
    ...(opts.articleType === "how_to" && opts.topic
      ? writerComposeHowToStructureIssues(html, opts.topic)
      : []),
    ...writerComposeBrandMentionIssues(html, opts.brandName, opts.brandMentionLevel),
  ].slice(0, 14);
}

/** Person/voice gaps — retried in engine loop but not post-link reconstruct blockers alone. */
export function writerComposeSoftVoiceIssues(
  html: string,
  opts: ComposeVoiceIssueOpts = {},
): string[] {
  return writerComposeOperatorVoiceIssues(html, opts);
}

export function hasComposeHardVoiceFailures(
  html: string,
  opts: ComposeHardVoiceOpts = {},
): boolean {
  return writerComposeHardVoiceIssues(html, opts).length > 0;
}

export function collectComposeHardVoiceRetryIssues(
  html: string,
  opts: ComposeHardVoiceOpts = {},
): string[] {
  return [...new Set(writerComposeHardVoiceIssues(html, opts))];
}

const COMPOSE_MIN_WE_PER_500_WORDS = 3;

/** Flags missing operator first-person voice in compose output. */
export type ComposeVoiceIssueOpts = {
  /**
   * The grammatical person this brand actually writes in, measured from its style examples.
   * When absent the check is skipped rather than defaulting to first-person plural.
   */
  person?: "first_plural" | "first_singular" | "second" | "third";
};

const PERSON_PRONOUN_RE: Record<string, RegExp> = {
  first_plural: /\b(?:we|our|us)\b/gi,
  first_singular: /\b(?:i|my|me)\b/g,
  second: /\b(?:you|your)\b/gi,
};

/**
 * Flags output whose narrating person is weaker than the brand's own.
 *
 * This previously hard-required first-person-plural "we" density for every voice and inspected
 * the opening for a fixed list of subject nouns from one client's sector, which pushed unrelated
 * brands into a "we"-heavy house style. It now checks against the brand's measured person and
 * does nothing when that is third person or unknown.
 */
export function writerComposeOperatorVoiceIssues(
  html: string,
  opts: ComposeVoiceIssueOpts = {},
): string[] {
  const person = opts.person;
  if (!person || person === "third") return [];
  const pronounRe = PERSON_PRONOUN_RE[person];
  if (!pronounRe) return [];

  const plain = stripHtmlToPlainText(html);
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length < 120) return [];

  const issues: string[] = [];
  const count = (plain.match(pronounRe) ?? []).length;
  const per500 = (count / words.length) * 500;
  if (per500 < COMPOSE_MIN_WE_PER_500_WORDS) {
    issues.push(
      `Low first-person voice for this brand (${count} matches in ${words.length} words) — match the person used in brand examples`,
    );
  }

  return issues.slice(0, 2);
}

const REJECTION_HEADING_RE = /\b(?:reject|never|won'?t|stand against)\b/i;
const REJECTION_BODY_RE = /\bwe\s+(?:reject|never|won'?t|don'?t|avoid|refuse|stand against)\b/i;

/** Flags headings that promise a stance the section body never delivers. */
export function writerComposeSectionRoleIssues(html: string): string[] {
  const issues: string[] = [];
  const sectionRe = /<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = sectionRe.exec(html)) !== null) {
    const heading = stripHtmlToPlainText(match[1] ?? "").trim();
    if (!heading || !REJECTION_HEADING_RE.test(heading)) continue;
    const body = stripHtmlToPlainText(match[2] ?? "");
    if (body.trim().length < 40) continue;
    if (!REJECTION_BODY_RE.test(body)) {
      issues.push(
        `Section "${heading}" promises rejection but body never rejects anything — state what we reject/never do, or rename the heading`,
      );
    }
  }
  return issues.slice(0, 3);
}

const COMPOSE_MIN_CONCRETE_PER_500_WORDS = 3;
const COMPOSE_CONCRETENESS_MIN_WORDS = 300;
const COMPOSE_RHYTHM_MIN_WORDS = 400;
const COMPOSE_RHYTHM_SHORT_PARAGRAPH_WORDS = 12;

/** Flags abstract compose copy lacking numbers, names, and brand specifics. */
export function writerComposeConcretenessIssues(html: string): string[] {
  const plain = stripHtmlToPlainText(html);
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length < COMPOSE_CONCRETENESS_MIN_WORDS) return [];

  const numberMatches = plain.match(/\d+(?:[.,]\d+)*%?/g) ?? [];
  // Multi-word capitalized sequences (names/places); sentence starts rarely chain capitals.
  const properNounMatches = plain.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? [];
  const concreteCount = numberMatches.length + properNounMatches.length;
  const per500 = (concreteCount / words.length) * 500;

  if (per500 < COMPOSE_MIN_CONCRETE_PER_500_WORDS) {
    return [
      `Article reads abstract (${concreteCount} concrete specifics in ${words.length} words) — anchor claims with concrete brand specifics (numbers, named tests, places)`,
    ];
  }
  return [];
}

/** Flags uniform paragraph rhythm missing short punchy lines and bold emphasis. */
export function writerComposeRhythmIssues(html: string): string[] {
  const plain = stripHtmlToPlainText(html);
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length < COMPOSE_RHYTHM_MIN_WORDS) return [];

  const paragraphs = writerHtmlParagraphs(html)
    .map((p) => stripHtmlToPlainText(p).trim())
    .filter(Boolean);
  const hasShortParagraph = paragraphs.some(
    (t) => t.split(/\s+/).filter(Boolean).length <= COMPOSE_RHYTHM_SHORT_PARAGRAPH_WORDS,
  );

  const bodyWithoutHeadings = html.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, "");
  const hasBoldLines = /<(?:strong|b)\b/i.test(bodyWithoutHeadings);

  if (!hasShortParagraph && !hasBoldLines) {
    return [
      "No rhythm variation — add short punchy one-line paragraphs and bold conviction lines like brand examples",
    ];
  }
  return [];
}

/** Flags blog page chrome or copied example metadata in compose output. */
export function writerComposeReferenceLeakIssues(
  html: string,
  knownExampleTitles: string[] = [],
): string[] {
  const plain = stripHtmlToPlainText(html);
  return composeReferenceLeakPlainTextIssues(plain, knownExampleTitles);
}

/** Flags industry-guide FAQ shape vs short editorial FAQ answers. */
export function writerComposeFaqStyleIssues(
  html: string,
  faqItems: { question: string; answer: string }[] = [],
): string[] {
  const issues: string[] = [];
  const faqHeadingRe = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let faqMatch: RegExpExecArray | null;
  while ((faqMatch = faqHeadingRe.exec(html)) !== null) {
    const title = stripHtmlToPlainText(faqMatch[1] ?? "").trim();
    if (
      /^(your questions answered|common questions|frequently asked questions)$/i.test(title) ||
      /^curious about\b/i.test(title) ||
      /^got questions\b/i.test(title) ||
      /^your questions\b/i.test(title) ||
      /\?$/.test(title)
    ) {
      issues.push(`FAQ section title "${title}" — use a punchy editorial title from brand examples`);
    }
  }

  const qaBlockRe = /<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  const answers: string[] = [];
  let qaCount = 0;
  let qaMatch: RegExpExecArray | null;
  while ((qaMatch = qaBlockRe.exec(html)) !== null) {
    const question = stripHtmlToPlainText(qaMatch[1] ?? "").trim();
    if (!question.endsWith("?")) continue;
    qaCount++;
    answers.push(stripHtmlToPlainText(qaMatch[2] ?? ""));
  }

  if (qaCount >= COMPOSE_FAQ_MIN_QUESTION_BLOCKS) {
    issues.push(
      `FAQ has ${qaCount} Q&A blocks — use fewer items with shorter editorial answers (max ~4 unless facts require more)`,
    );
  }

  if (answers.length >= 3) {
    const avgAnswerWords =
      answers.reduce((sum, a) => sum + a.split(/\s+/).filter(Boolean).length, 0) /
      answers.length;
    if (avgAnswerWords > COMPOSE_FAQ_MAX_ANSWER_WORDS) {
      issues.push(
        `FAQ answers average ${Math.round(avgAnswerWords)} words — keep answers to 1–2 sentences`,
      );
    }
  }

  const qaBlockRe2 = /<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let overlapMatch: RegExpExecArray | null;
  while (faqItems.length > 0 && (overlapMatch = qaBlockRe2.exec(html)) !== null) {
    const answer = stripHtmlToPlainText(overlapMatch[2] ?? "").trim();
    if (answer.length < 30) continue;
    for (const item of faqItems) {
      const source = item.answer.trim();
      if (source.length < 30) continue;
      const answerWords = new Set(
        answer
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3),
      );
      const sourceWords = source
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      if (sourceWords.length === 0) continue;
      const matched = sourceWords.filter((w) => answerWords.has(w)).length;
      if (matched / sourceWords.length >= 0.7) {
        issues.push("FAQ answer copies research brief wording — rewrite in brand voice");
        break;
      }
    }
    if (issues.some((i) => i.includes("copies research brief"))) break;
  }

  return [...new Set(issues)].slice(0, 5);
}

export function writerHasRelatedLinksBlock(html: string): boolean {
  return /<h2\b[^>]*>\s*Related links\s*<\/h2>/i.test(html);
}

/** Compose link quality: inline only, no Related links dump. */
export function writerComposeLinkIssues(
  html: string,
  links: WriterLink[],
  sourceText: string,
): string[] {
  if (!links.length) return [];
  const issues: string[] = [];
  if (writerHasRelatedLinksBlock(html)) {
    issues.push("Article contains a Related links section — weave links inline instead");
  }
  const missing = writerLinksMissingFromHtml(html, links);
  if (missing.length) {
    issues.push(`${missing.length} requested link(s) missing from body`);
  }
  if (writerLinksClusteredAtEnd(html, links)) {
    issues.push("Links clustered at end of article — spread into middle sections");
  }
  if (writerLinksUnnaturalPlacement(html, links)) {
    issues.push("Unnatural link placement (parenthetical, See anchor, or link-only sentences)");
  }
  if (writerLinksShallowOrFabricated(sourceText, html, links)) {
    issues.push("Shallow or fabricated link placement");
  }
  return [...new Set(issues)].slice(0, 6);
}

const httpsUrl = z
  .string()
  .trim()
  .min(1)
  .refine((s) => z.string().url().safeParse(s).success, { message: "Invalid URL" })
  .refine((s) => s.startsWith("https://"), { message: "URL must use https" });

export const writerLinkSchema = z.object({
  url: httpsUrl,
  label: z.string().trim().max(WRITER_LINK_LABEL_MAX).optional(),
});

export type WriterLink = z.infer<typeof writerLinkSchema>;

export const writerRewriteInputSchema = z.object({
  voice_id: z.string().uuid(),
  source_text: z
    .string()
    .trim()
    .min(WRITER_SOURCE_MIN_CHARS, `Article must be at least ${WRITER_SOURCE_MIN_CHARS} characters`)
    .max(WRITER_SOURCE_MAX_CHARS),
  links: z.array(writerLinkSchema).max(WRITER_LINK_MAX).default([]),
  writer_article_id: z.string().uuid().optional(),
  rewrite_divergence_min: z.coerce.number().int().min(0).max(100).default(0),
  preserve_instructions: z.boolean().default(false),
});

export type WriterRewriteInput = z.infer<typeof writerRewriteInputSchema>;

export const writerComposeInputSchema = z.object({
  voice_id: z.string().uuid(),
  topic: z
    .string()
    .trim()
    .min(WRITER_TOPIC_MIN_CHARS, `Topic must be at least ${WRITER_TOPIC_MIN_CHARS} characters`)
    .max(WRITER_TOPIC_MAX_CHARS),
  reference_urls: z.array(httpsUrl).max(WRITER_REFERENCE_URL_MAX).default([]),
  links: z.array(writerLinkSchema).max(WRITER_LINK_MAX).default([]),
  writer_article_id: z.string().uuid().optional(),
  deep_research: z.boolean().default(true),
  web_search: z.boolean().default(true),
  web_search_max_queries: z.coerce
    .number()
    .int()
    .min(1)
    .max(WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT)
    .default(WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT),
  web_search_max_results: z.coerce
    .number()
    .int()
    .min(1)
    .max(WRITER_WEB_SEARCH_MAX_RESULTS_LIMIT)
    .default(WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT),
  article_depth: z.coerce.number().int().min(0).max(100).default(WRITER_ARTICLE_DEPTH_DEFAULT),
  subtopics: z
    .array(z.string().trim().min(WRITER_SUBTOPIC_MIN_CHARS).max(WRITER_SUBTOPIC_MAX_CHARS))
    .max(WRITER_SUBTOPIC_MAX)
    .default([]),
  include_faq: z.boolean().default(false),
  article_type: composeArticleTypeSchema.default("editorial"),
  skip_research: z.boolean().default(false),
  research_brief: z.string().trim().optional(),
  /** Structured facts for product_update articles, which do not use web research. */
  product_brief: z.preprocess(
    (v) => (v == null ? undefined : v),
    productUpdateBriefSchema.optional(),
  ),
}).superRefine((data, ctx) => {
  if (data.article_type === "product_update" && !data.product_brief) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "product_brief is required for product update articles",
      path: ["product_brief"],
    });
  }
  // A product update supplies its own facts, so it never needs a research brief.
  if (data.article_type === "product_update") return;
  if (!data.skip_research) return;
  if (!data.writer_article_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "writer_article_id is required when skip_research is true",
      path: ["writer_article_id"],
    });
  }
  const brief = data.research_brief?.trim() ?? "";
  if (brief.length < WRITER_SOURCE_MIN_CHARS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Research brief must be at least ${WRITER_SOURCE_MIN_CHARS} characters when skip_research is true`,
      path: ["research_brief"],
    });
  }
});

export type WriterComposeInput = z.infer<typeof writerComposeInputSchema>;

export function parseWriterReferenceUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const url = typeof item === "string" ? item.trim() : String(item ?? "").trim();
    if (!url) continue;
    const parsed = httpsUrl.safeParse(url);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= WRITER_REFERENCE_URL_MAX) break;
  }
  return out;
}

export function parseWriterSubtopics(raw: unknown): string[] {
  const lines = Array.isArray(raw)
    ? raw.map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    : typeof raw === "string"
      ? raw.split(/\r?\n/).map((l) => l.trim())
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.length < WRITER_SUBTOPIC_MIN_CHARS) continue;
    const clipped = line.slice(0, WRITER_SUBTOPIC_MAX_CHARS);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= WRITER_SUBTOPIC_MAX) break;
  }
  return out;
}

export function parseWriterLinks(raw: unknown): WriterLink[] {
  if (!Array.isArray(raw)) return [];
  const out: WriterLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const url = String((item as { url?: unknown }).url ?? "").trim();
    if (!url) continue;
    const labelRaw = (item as { label?: unknown }).label;
    const label =
      labelRaw != null && String(labelRaw).trim() ? String(labelRaw).trim() : undefined;
    const parsed = writerLinkSchema.safeParse({ url, label });
    if (parsed.success) out.push(parsed.data);
    if (out.length >= WRITER_LINK_MAX) break;
  }
  return out;
}

/** Escape text for HTML text nodes and double-quoted attributes. */
function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** URL variants to match in generated HTML (trailing slash, encoded forms). */
function writerLinkUrlVariants(url: string): string[] {
  const trimmed = url.trim();
  const variants = new Set<string>([trimmed]);
  if (trimmed.endsWith("/")) {
    variants.add(trimmed.slice(0, -1));
  } else {
    variants.add(`${trimmed}/`);
  }
  try {
    const parsed = new URL(trimmed);
    variants.add(parsed.href);
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      const noSlash = new URL(trimmed);
      noSlash.pathname = parsed.pathname.replace(/\/$/, "");
      variants.add(noSlash.href);
    }
  } catch {
    // keep trimmed variants only
  }
  return [...variants];
}

/** All href values from `<a>` tags in HTML. */
export function writerAnchorHrefsInHtml(html: string): string[] {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const hrefs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]?.trim();
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function hrefMatchesWriterUrl(href: string, url: string): boolean {
  const hrefVariants = new Set(writerLinkUrlVariants(href));
  for (const variant of writerLinkUrlVariants(url)) {
    if (hrefVariants.has(variant)) return true;
  }
  return false;
}

export function writerLinkPresentInHtml(html: string, url: string): boolean {
  if (!url.trim()) return false;
  return writerAnchorHrefsInHtml(html).some((href) => hrefMatchesWriterUrl(href, url));
}

export function writerLinksPresentCount(html: string, links: WriterLink[]): number {
  return links.filter((l) => writerLinkPresentInHtml(html, l.url)).length;
}

const SOURCE_HTTPS_URL_RE = /https:\/\/[^\s<>"')\]]+/gi;

/** Extract https URLs from plain text and any anchor hrefs in pasted source. */
export function writerUrlsInSourceText(sourceText: string): string[] {
  const urls = new Set<string>();
  for (const href of writerAnchorHrefsInHtml(sourceText)) {
    if (href.startsWith("https://")) urls.add(href);
  }
  const re = new RegExp(SOURCE_HTTPS_URL_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(sourceText)) !== null) {
    const raw = m[0]?.replace(/[.,;:!?)]+$/, "");
    if (raw?.startsWith("https://")) urls.add(raw);
  }
  return [...urls];
}

export function writerUrlInSourceText(sourceText: string, url: string): boolean {
  if (!url.trim()) return false;
  return writerUrlsInSourceText(sourceText).some((src) => hrefMatchesWriterUrl(src, url));
}

/** Count anchor hrefs in rewrite that match none of the requested URLs. */
export function writerNonRequestedLinksInHtml(html: string, links: WriterLink[]): number {
  let count = 0;
  for (const href of writerAnchorHrefsInHtml(html)) {
    if (!href.startsWith("https://")) continue;
    if (!links.some((l) => hrefMatchesWriterUrl(href, l.url))) count++;
  }
  return count;
}

/** Requested URLs that were already in source and appear as anchors in output. */
export function writerRequestedLinksCarriedFromSource(
  sourceText: string,
  html: string,
  links: WriterLink[],
): number {
  return links.filter(
    (l) => writerUrlInSourceText(sourceText, l.url) && writerLinkPresentInHtml(html, l.url),
  ).length;
}

/** Requested URLs present in output that were not already in source. */
export function writerRequestedLinksAdded(
  sourceText: string,
  html: string,
  links: WriterLink[],
): number {
  const present = writerLinksPresentCount(html, links);
  const carried = writerRequestedLinksCarriedFromSource(sourceText, html, links);
  return Math.max(0, present - carried);
}

export function writerLinksMissingFromHtml(html: string, links: WriterLink[]): WriterLink[] {
  return links.filter((l) => !writerLinkPresentInHtml(html, l.url));
}

/** Split HTML fragment into `<p>...</p>` blocks for placement heuristics. */
export function writerHtmlParagraphs(html: string): string[] {
  const re = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  return html.match(re) ?? [];
}

/** Paragraph indices (0-based) where the URL appears inside a `<p>` block. */
export function writerLinkParagraphIndices(html: string, url: string): number[] {
  const paragraphs = writerHtmlParagraphs(html);
  const indices: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (writerLinkPresentInHtml(paragraphs[i] ?? "", url)) indices.push(i);
  }
  return indices;
}

const CLUSTER_END_PARAGRAPH_FRACTION = 0.6;

/**
 * True when multiple links all appear only near the end (shoehorned closing sentences).
 */
export function writerLinksClusteredAtEnd(html: string, links: WriterLink[]): boolean {
  if (links.length < 2) return false;
  const paragraphs = writerHtmlParagraphs(html);
  const pCount = paragraphs.length;
  if (pCount < 2) return false;

  const threshold = Math.ceil(pCount * CLUSTER_END_PARAGRAPH_FRACTION);
  const minIndices: number[] = [];

  for (const link of links) {
    const found = writerLinkParagraphIndices(html, link.url);
    if (!found.length) return false;
    minIndices.push(Math.min(...found));
  }

  if (minIndices.every((i) => i >= threshold)) return true;

  const lastSpan = Math.max(1, Math.ceil(pCount * (1 - CLUSTER_END_PARAGRAPH_FRACTION)));
  const startIdx = pCount - lastSpan;
  if (minIndices.every((i) => i >= startIdx)) return true;

  if (pCount >= 3 && new Set(minIndices).size === 1 && minIndices[0]! >= pCount - 2) {
    return true;
  }

  return false;
}

const SPREAD_END_PARAGRAPH_FRACTION = 0.25;
const SPREAD_MEAN_POSITION_FRACTION = 0.65;

/** True when requested links are too concentrated toward the end of the article body. */
export function writerLinksNeedSpread(html: string, links: WriterLink[]): boolean {
  if (!links.length) return false;
  if (writerLinksMissingFromHtml(html, links).length > 0) return false;

  if (writerLinksClusteredAtEnd(html, links)) return true;

  const paragraphs = writerHtmlParagraphs(html);
  const pCount = paragraphs.length;
  if (pCount < 2) return false;

  const indices: number[] = [];
  for (const link of links) {
    const found = writerLinkParagraphIndices(html, link.url);
    if (!found.length) return false;
    indices.push(Math.min(...found));
  }

  if (links.length === 1 && pCount >= 3) {
    const idx = indices[0]!;
    const lastQuarterStart = Math.ceil(pCount * (1 - SPREAD_END_PARAGRAPH_FRACTION));
    if (idx === pCount - 1 || idx >= lastQuarterStart) return true;
  }

  if (links.length >= 2 && pCount >= 4 && new Set(indices).size === 1) return true;

  if (links.length >= 2 && pCount >= 2) {
    const mean = indices.reduce((a, b) => a + b, 0) / indices.length;
    if (mean > SPREAD_MEAN_POSITION_FRACTION * (pCount - 1)) return true;
  }

  return false;
}

/**
 * True when a link sits in a short promotional sentence or link-only micro-paragraph.
 */
export function writerLinksShallowOrFabricated(
  sourceText: string,
  html: string,
  links: WriterLink[],
): boolean {
  const paragraphs = writerHtmlParagraphs(html);
  const sourceNorm = sourceText.trim();

  for (const link of links) {
    if (!writerLinkPresentInHtml(html, link.url)) continue;

    const pIdx = writerLinkParagraphForUrl(html, link.url);
    if (pIdx == null) continue;

    const paragraph = paragraphs[pIdx] ?? "";
    const plain = stripHtmlToPlainText(paragraph);
    const wordCount = countWords(plain);
    const anchor = writerLinkAnchorText(link);
    const anchorWords = anchorWordsInParagraph(paragraph, link.url);
    const labelInSource = normalizedContains(sourceNorm, anchor);

    if (
      !labelInSource &&
      wordCount <= FABRICATED_LINK_PARAGRAPH_MAX_WORDS &&
      normalizedContains(plain, anchor)
    ) {
      return true;
    }

    if (
      wordCount <= SHALLOW_LINK_PARAGRAPH_MAX_WORDS &&
      anchorWords > 0 &&
      anchorWords / wordCount >= SHALLOW_ANCHOR_WORD_FRACTION
    ) {
      return true;
    }
  }

  return false;
}

export function writerLinksNeedRevision(
  html: string,
  links: WriterLink[],
  sourceText: string,
): boolean {
  if (!links.length) return false;
  if (writerLinksMissingFromHtml(html, links).length > 0) return true;
  if (writerLinksClusteredAtEnd(html, links)) return true;
  if (writerLinksShallowOrFabricated(sourceText, html, links)) return true;
  if (writerLinksUnnaturalPlacement(html, links)) return true;
  return false;
}

/** True when links sit in parenthetical afterthoughts or other non-inline patterns. */
export function writerLinksUnnaturalPlacement(html: string, links: WriterLink[]): boolean {
  if (!links.length) return false;

  const body = html.split(/<h2\b[^>]*>\s*Related links\s*<\/h2>/i)[0] ?? html;
  if (/\(\s*<a\b/i.test(body)) return true;
  if (/\bSee\s+<a\b/i.test(body)) return true;

  for (const link of links) {
    if (!writerLinkPresentInHtml(body, link.url)) continue;
    const paragraphs = writerHtmlParagraphs(body);
    const pIdx = writerLinkParagraphForUrl(body, link.url);
    if (pIdx == null) continue;
    const paragraph = paragraphs[pIdx] ?? "";
    if (/\(\s*<a\b[^>]*>[\s\S]*?<\/a>\s*\)/i.test(paragraph)) return true;
    if (/\.\s*\(\s*<a\b/i.test(paragraph)) return true;
    if (/\bSee\s+<a\b/i.test(paragraph)) return true;

    const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(paragraph)) !== null) {
      const href = m[1]?.trim();
      if (!href || !hrefMatchesWriterUrl(href, link.url)) continue;
      const inner = stripHtmlToPlainText(m[2] ?? "").trim().toLowerCase();
      if (inner === "source") return true;
    }
  }

  return false;
}

export function formatWriterLinksForPrompt(
  links: WriterLink[],
  opts?: { exactAnchorLabels?: boolean },
): string {
  if (!links.length) return "(none — do not add external links)";
  const placementHints = [
    "early body (first ~third)",
    "middle body",
    "later body (not closing paragraph)",
    "upper-middle body",
    "lower-middle body",
  ];
  const lines = links.map((l, i) => {
    const label = l.label?.trim();
    const anchorPart = label
      ? opts?.exactAnchorLabels
        ? ` — preferred anchor text (use when it fits naturally in a sentence): ${label}`
        : ` — suggested anchor: ${label}`
      : "";
    const placement =
      links.length >= 2 ? ` — place in ${placementHints[i % placementHints.length]}` : "";
    return `${i + 1}. URL: ${l.url}${anchorPart}${placement}`;
  });
  lines.push("Placement: distribute links across the article body, not clustered at the end.");
  if (opts?.exactAnchorLabels && links.some((l) => l.label?.trim())) {
    lines.push(
      "When preferred anchor text is listed, use it as the link text only when it fits naturally in the sentence. Otherwise link the closest natural phrase already in the paragraph.",
    );
    lines.push(
      "Never append links as parenthetical afterthoughts like (anchor text) or trailing See anchor.",
    );
  }
  return lines.join("\n");
}

/** Strip HTML to plain text for comparison heuristics. */
export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

const DIVERGENCE_MIN_WORD_LEN = 2;
const DIVERGENCE_NGRAM_SIZE = 4;
const DIVERGENCE_SHORT_SOURCE_MAX_WORDS = 400;

function tokenizeForDivergence(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= DIVERGENCE_MIN_WORD_LEN);
  return new Set(tokens);
}

function ngramsForDivergence(text: string, n: number): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const grams = new Set<string>();
  if (tokens.length < n) {
    if (tokens.length) grams.add(tokens.join(" "));
    return grams;
  }
  for (let i = 0; i <= tokens.length - n; i++) {
    grams.add(tokens.slice(i, i + n).join(" "));
  }
  return grams;
}

function jaccardDivergenceScore(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  if (!a.size || !b.size) return 100;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return Math.round(100 * (1 - intersection / union));
}

/**
 * 0 = nearly identical wording, 100 = very different (max of word + n-gram Jaccard distance).
 */
export function writerRewriteDivergenceScore(sourceText: string, rewriteHtml: string): number {
  const sourcePlain = sourceText.trim();
  const rewritePlain = stripHtmlToPlainText(rewriteHtml);
  const wordScore = jaccardDivergenceScore(
    tokenizeForDivergence(sourcePlain),
    tokenizeForDivergence(rewritePlain),
  );
  const phrase4Score = jaccardDivergenceScore(
    ngramsForDivergence(sourcePlain, DIVERGENCE_NGRAM_SIZE),
    ngramsForDivergence(rewritePlain, DIVERGENCE_NGRAM_SIZE),
  );
  const scores = [wordScore, phrase4Score];
  if (countWords(stripHtmlToPlainText(sourcePlain)) < DIVERGENCE_SHORT_SOURCE_MAX_WORDS) {
    scores.push(
      jaccardDivergenceScore(
        ngramsForDivergence(sourcePlain, 3),
        ngramsForDivergence(rewritePlain, 3),
      ),
    );
  }
  return Math.max(...scores);
}

export function writerLinkParagraphForUrl(html: string, url: string): number | null {
  const indices = writerLinkParagraphIndices(html, url);
  return indices.length ? Math.min(...indices) : null;
}

const FABRICATED_LINK_PARAGRAPH_MAX_WORDS = 25;
const SHALLOW_LINK_PARAGRAPH_MAX_WORDS = 12;
const SHALLOW_ANCHOR_WORD_FRACTION = 0.35;

function countWords(text: string): number {
  const plain = text.trim();
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

function normalizedContains(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.trim().toLowerCase();
  return n.length > 0 && h.includes(n);
}

function wordBoundaryRegex(phrase: string): RegExp {
  return new RegExp(`\\b${escapeRegex(phrase.trim())}\\b`, "i");
}

function plainContainsPhrase(plain: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) return false;
  return wordBoundaryRegex(trimmed).test(plain);
}

function anchorWordsInParagraph(paragraphHtml: string, url: string): number {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraphHtml)) !== null) {
    const href = m[1]?.trim();
    if (href && hrefMatchesWriterUrl(href, url)) {
      return countWords(stripHtmlToPlainText(m[2] ?? ""));
    }
  }
  return 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WEAVE_PARAGRAPH_FRACTIONS = [0.25, 0.5, 0.75, 0.33, 0.66];
const REDISTRIBUTE_END_CAP_FRACTION = 0.15;

function writerLinkSpreadTargetIndex(linkIndex: number, linkCount: number, pCount: number): number {
  const maxTarget = Math.max(0, pCount - Math.ceil(pCount * REDISTRIBUTE_END_CAP_FRACTION) - 1);
  if (linkCount <= 1) {
    return Math.min(maxTarget, Math.max(0, Math.floor(maxTarget / 2)));
  }
  const slot = Math.round((linkIndex * maxTarget) / Math.max(1, linkCount - 1));
  return Math.min(maxTarget, Math.max(0, slot));
}

function extractWriterLinkAnchorFromParagraph(
  paragraph: string,
  url: string,
): { anchorHtml: string; anchorText: string } | null {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraph)) !== null) {
    const href = m[1]?.trim();
    if (href && hrefMatchesWriterUrl(href, url)) {
      return {
        anchorHtml: m[0] ?? "",
        anchorText: stripHtmlToPlainText(m[2] ?? ""),
      };
    }
  }
  return null;
}

function linkParagraphIndexInArray(paragraphs: string[], url: string): number | null {
  for (let i = 0; i < paragraphs.length; i++) {
    if (writerLinkPresentInHtml(paragraphs[i] ?? "", url)) return i;
  }
  return null;
}

function linkablePhraseCandidates(anchor: string, exactAnchorLabels?: boolean): string[] {
  const words = anchor.trim().split(/\s+/).filter(Boolean);
  if (exactAnchorLabels && words.length > 1) {
    return [anchor.trim()];
  }
  const candidates: string[] = [];
  for (let len = words.length; len >= 1; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      candidates.push(words.slice(start, start + len).join(" "));
    }
  }
  return [...new Set(candidates)].sort((a, b) => b.length - a.length);
}

function wrapFirstMatchingPhrase(
  paragraph: string,
  plain: string,
  href: string,
  phrases: string[],
): string | null {
  for (const phrase of phrases) {
    if (!plainContainsPhrase(plain, phrase)) continue;
    const phraseEsc = escapeHtmlText(phrase);
    const phraseRe = wordBoundaryRegex(phrase);
    const updated = paragraph.replace(phraseRe, `<a href="${href}">${phraseEsc}</a>`);
    if (updated !== paragraph) return updated;
  }
  return null;
}

function insertWriterLinkIntoParagraph(
  paragraph: string,
  link: WriterLink,
  preferredAnchorText?: string,
  exactAnchorLabels?: boolean,
): string {
  if (writerLinkPresentInHtml(paragraph, link.url)) return paragraph;

  const href = escapeHtmlText(link.url);
  const anchor = preferredAnchorText?.trim() || writerLinkAnchorText(link);
  const anchorEsc = escapeHtmlText(anchor);
  const plain = stripHtmlToPlainText(paragraph);

  if (plainContainsPhrase(plain, anchor)) {
    const anchorRe = wordBoundaryRegex(anchor);
    return paragraph.replace(anchorRe, `<a href="${href}">${anchorEsc}</a>`);
  }

  const phraseMatch = wrapFirstMatchingPhrase(
    paragraph,
    plain,
    href,
    linkablePhraseCandidates(anchor, exactAnchorLabels),
  );
  if (phraseMatch) return phraseMatch;

  return paragraph;
}

/**
 * Move existing anchors from late paragraphs into evenly spaced body slots.
 */
export function redistributeWriterLinksInBody(
  html: string,
  links: WriterLink[],
): { html: string; redistributed: number } {
  if (!links.length) return { html, redistributed: 0 };

  const paragraphRe = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  const matches = [...html.matchAll(paragraphRe)];
  const paragraphs = matches.map((m) => m[0]);
  const pCount = paragraphs.length;
  if (pCount < 2) return { html, redistributed: 0 };

  let redistributed = 0;

  for (let i = 0; i < links.length; i++) {
    const link = links[i]!;
    const targetIdx = writerLinkSpreadTargetIndex(i, links.length, pCount);
    const currentIdx = linkParagraphIndexInArray(paragraphs, link.url);
    if (currentIdx == null) continue;
    if (Math.abs(currentIdx - targetIdx) <= 1) continue;

    const extracted = extractWriterLinkAnchorFromParagraph(paragraphs[currentIdx] ?? "", link.url);
    if (!extracted) continue;

    let sourceParagraph = paragraphs[currentIdx] ?? "";
    const strippedSource = sourceParagraph
      .replace(extracted.anchorHtml, extracted.anchorText)
      .replace(/\s{2,}/g, " ");

    if (currentIdx !== targetIdx) {
      const targetBefore = paragraphs[targetIdx] ?? "";
      const targetAfter = insertWriterLinkIntoParagraph(
        targetBefore,
        link,
        extracted.anchorText,
      );
      if (
        targetAfter !== targetBefore &&
        writerLinkPresentInHtml(targetAfter, link.url)
      ) {
        paragraphs[targetIdx] = targetAfter;
        paragraphs[currentIdx] = strippedSource;
        redistributed++;
      }
    }
  }

  let result = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const original = matches[i]![0];
    const updated = paragraphs[i]!;
    if (original !== updated) {
      const start = matches[i]!.index!;
      result = result.slice(0, start) + updated + result.slice(start + original.length);
    }
  }

  return { html: result, redistributed };
}

/**
 * Deterministically weave missing links into body paragraphs as inline anchors.
 */
export function weaveMissingWriterLinksInBody(
  html: string,
  missingLinks: WriterLink[],
  opts?: { exactAnchorLabels?: boolean },
): { html: string; woven: number } {
  if (!missingLinks.length) return { html, woven: 0 };

  const paragraphRe = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  const matches = [...html.matchAll(paragraphRe)];
  const paragraphs = matches.map((m) => m[0]);
  if (!paragraphs.length) return { html, woven: 0 };

  let woven = 0;
  for (let i = 0; i < missingLinks.length; i++) {
    const link = missingLinks[i]!;
    const frac = WEAVE_PARAGRAPH_FRACTIONS[i % WEAVE_PARAGRAPH_FRACTIONS.length]!;
    const preferredIdx = Math.min(
      paragraphs.length - 1,
      Math.max(0, Math.floor(paragraphs.length * frac)),
    );
    const tryOrder = [
      preferredIdx,
      ...paragraphs.map((_, idx) => idx).filter((idx) => idx !== preferredIdx),
    ];
    for (const pIdx of tryOrder) {
      const paragraph = paragraphs[pIdx] ?? "";
      const updated = insertWriterLinkIntoParagraph(
        paragraph,
        link,
        undefined,
        opts?.exactAnchorLabels,
      );
      if (updated !== paragraph && writerLinkPresentInHtml(updated, link.url)) {
        paragraphs[pIdx] = updated;
        woven++;
        break;
      }
    }
  }

  let result = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const original = matches[i]![0];
    const updated = paragraphs[i]!;
    if (original !== updated) {
      const start = matches[i]!.index!;
      result = result.slice(0, start) + updated + result.slice(start + original.length);
    }
  }
  return { html: result, woven };
}

/** Inline weave + redistribution only (no Related links block or label enforcement). */
export function mechanicalWriterLinksInHtml(
  html: string,
  links: WriterLink[],
  opts?: { exactAnchorLabels?: boolean },
): { html: string; linksWoven: number; linksRedistributed: number } {
  let out = html;
  let missing = writerLinksMissingFromHtml(out, links);
  let linksWoven = 0;
  if (missing.length) {
    const woven = weaveMissingWriterLinksInBody(out, missing, opts);
    out = woven.html;
    linksWoven = woven.woven;
    missing = writerLinksMissingFromHtml(out, links);
  }

  let linksRedistributed = 0;
  if (writerLinksNeedSpread(out, links)) {
    const redistributed = redistributeWriterLinksInBody(out, links);
    out = redistributed.html;
    linksRedistributed = redistributed.redistributed;
    missing = writerLinksMissingFromHtml(out, links);
    if (missing.length) {
      const reWoven = weaveMissingWriterLinksInBody(out, missing, opts);
      out = reWoven.html;
      linksWoven += reWoven.woven;
    }
  }

  return { html: out, linksWoven, linksRedistributed };
}

/** Enforce anchor labels and append Related links for any still-missing URLs. */
export function postReviseWriterLinksInHtml(
  html: string,
  links: WriterLink[],
  opts?: { allowAppendedLinks?: boolean },
): { html: string; linksAppended: number } {
  let out = html;
  const missing = writerLinksMissingFromHtml(out, links);
  let linksAppended = 0;
  const allowAppended = opts?.allowAppendedLinks !== false;
  if (missing.length && allowAppended) {
    const before = out;
    out = ensureWriterLinksInHtml(out, missing);
    if (out !== before) linksAppended = missing.length;
  }
  out = enforceWriterLinkAnchorLabels(out, links);
  return { html: out, linksAppended };
}

/** Weave missing links into body; redistribute end-heavy links; append Related links when needed. */
export function finalizeWriterLinksInHtml(
  html: string,
  links: WriterLink[],
): { html: string; linksWoven: number; linksAppended: number; linksRedistributed: number } {
  const mechanical = mechanicalWriterLinksInHtml(html, links);
  const post = postReviseWriterLinksInHtml(mechanical.html, links);
  return {
    html: post.html,
    linksWoven: mechanical.linksWoven,
    linksAppended: post.linksAppended,
    linksRedistributed: mechanical.linksRedistributed,
  };
}

export function writerLinkAnchorMatches(html: string, link: WriterLink): boolean {
  const label = link.label?.trim();
  if (!label) return true;
  if (!writerLinkPresentInHtml(html, link.url)) return false;

  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const want = label.toLowerCase();
  while ((m = re.exec(html)) !== null) {
    const href = m[1]?.trim();
    if (!href || !hrefMatchesWriterUrl(href, link.url)) continue;
    const inner = stripHtmlToPlainText(m[2] ?? "").trim().toLowerCase();
    if (inner === want) return true;
  }
  return false;
}

/** Replace anchor inner text with user-provided labels for matching URLs. */
export function enforceWriterLinkAnchorLabels(html: string, links: WriterLink[]): string {
  const paragraphRe = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  return html.replace(paragraphRe, (paragraph) => {
    const plain = stripHtmlToPlainText(paragraph);
    let updated = paragraph;
    for (const link of links) {
      const label = link.label?.trim();
      if (!label || !plainContainsPhrase(plain, label)) continue;

      const re = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*?)>([\s\S]*?)<\/a>/gi;
      updated = updated.replace(re, (full, pre, href, post, _inner) => {
        if (!hrefMatchesWriterUrl(String(href).trim(), link.url)) return full;
        const hrefEsc = escapeHtmlText(String(href).trim());
        const labelEsc = escapeHtmlText(label);
        return `<a${pre}href="${hrefEsc}"${post}>${labelEsc}</a>`;
      });
    }
    return updated;
  });
}

export function writerLinkAnchorText(link: WriterLink): string {
  const label = link.label?.trim();
  if (label) return label;
  try {
    return new URL(link.url).hostname.replace(/^www\./i, "");
  } catch {
    return link.url;
  }
}

/** Append a Related links block for any URLs missing from model output. */
export function ensureWriterLinksInHtml(html: string, links: WriterLink[]): string {
  const missing = writerLinksMissingFromHtml(html, links);
  if (!missing.length) return html;

  const items = missing
    .map((link) => {
      const href = escapeHtmlText(link.url);
      const text = escapeHtmlText(writerLinkAnchorText(link));
      return `<li><a href="${href}">${text}</a></li>`;
    })
    .join("\n");

  const block = `<h2>Related links</h2>\n<ul>\n${items}\n</ul>`;
  const trimmed = html.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

export function defaultWriterTitle(sourceText: string): string {
  const line = sourceText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "Untitled article";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

export function defaultComposeTitle(topic: string): string {
  const trimmed = topic.trim();
  if (!trimmed) return "Untitled article";
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}

export type WriterArticleHtmlFields = {
  final_html?: string | null;
  generated_html?: string;
};

/** Prefer user-saved HTML over worker-generated output when displaying or editing. */
export function writerArticleDisplayHtml(article: WriterArticleHtmlFields | null | undefined): string {
  if (!article) return "";
  return article.final_html?.trim() || article.generated_html?.trim() || "";
}

export type ComposeTimestampFields = {
  compose_researched_at?: Date | null;
  compose_written_at?: Date | null;
  source_text?: string;
  generated_html?: string;
  updated_at: Date;
};

/** ISO timestamp for last research, with legacy fallback when brief exists. */
export function resolveComposeResearchedAtIso(article: ComposeTimestampFields): string | undefined {
  if (article.compose_researched_at) {
    return article.compose_researched_at.toISOString();
  }
  if (article.source_text?.trim()) {
    return article.updated_at.toISOString();
  }
  return undefined;
}

/** ISO timestamp for last article generation, with legacy fallback when HTML exists. */
export function resolveComposeWrittenAtIso(article: ComposeTimestampFields): string | undefined {
  if (article.compose_written_at) {
    return article.compose_written_at.toISOString();
  }
  if (article.generated_html?.trim()) {
    return article.updated_at.toISOString();
  }
  return undefined;
}
