import { z } from "zod";

/**
 * Structured brief for internal product/feature announcement posts.
 *
 * The compose pipeline assumes article facts come from the outside world — Tavily search plus
 * fetched reference URLs. For "we shipped X on one of our sites" there is no external corpus to
 * research, so that path produces a thin or wrong fact pool. Worse, the editorial prompts
 * explicitly forbid making the brand or its product the subject of the article, which is exactly
 * backwards for an announcement.
 *
 * A product update therefore supplies its own facts through this schema and renders them into a
 * brief, reusing the existing `skip_research` write-only path.
 */

export const PRODUCT_UPDATE_SUMMARY_MIN = 20;
export const PRODUCT_UPDATE_SUMMARY_MAX = 2000;
export const PRODUCT_UPDATE_DETAIL_MAX = 12;
export const PRODUCT_UPDATE_DETAIL_MAX_CHARS = 500;

const trimmed = (max: number) => z.string().trim().max(max);

function optionalText(max: number) {
  return z.preprocess(
    (v) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v),
    trimmed(max).optional(),
  );
}

function textList(maxItems: number, maxChars: number) {
  return z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
        : [],
    z.array(trimmed(maxChars)).max(maxItems).default([]),
  );
}

export const productUpdateBriefSchema = z.object({
  /** What shipped, in the author's own words. The one required field. */
  whatShipped: trimmed(PRODUCT_UPDATE_SUMMARY_MAX).min(
    PRODUCT_UPDATE_SUMMARY_MIN,
    `Describe what shipped in at least ${PRODUCT_UPDATE_SUMMARY_MIN} characters`,
  ),
  /** The problem it solves or the reason it was built. */
  why: optionalText(PRODUCT_UPDATE_SUMMARY_MAX),
  /** Who it is for. */
  whoFor: optionalText(500),
  /** What people did before — enables a genuine before/after rather than a feature list. */
  previously: optionalText(PRODUCT_UPDATE_SUMMARY_MAX),
  /** Concrete specifics: limits, numbers, supported formats, settings names. */
  details: textList(PRODUCT_UPDATE_DETAIL_MAX, PRODUCT_UPDATE_DETAIL_MAX_CHARS),
  /** Rollout status, e.g. "available to all plans from 3 March". */
  availability: optionalText(500),
  /** What is coming next, if anything. */
  whatsNext: optionalText(PRODUCT_UPDATE_SUMMARY_MAX),
  /** Product or site the update applies to. */
  productName: optionalText(200),
});

export type ProductUpdateBrief = z.infer<typeof productUpdateBriefSchema>;

export function isProductUpdateBriefEmpty(brief: Partial<ProductUpdateBrief> | undefined): boolean {
  return !brief?.whatShipped?.trim();
}

/**
 * Render the structured brief as plain briefing prose.
 *
 * Output feeds the same `research_brief` slot a researched topic would, so the rest of the
 * pipeline needs no special-casing for input handling.
 */
export function buildProductUpdateBrief(input: ProductUpdateBrief): string {
  const brief = productUpdateBriefSchema.parse(input);
  const sections: string[] = [];

  const subject = brief.productName?.trim()
    ? `${brief.productName.trim()}: ${brief.whatShipped}`
    : brief.whatShipped;
  sections.push(`What shipped:\n${subject}`);

  if (brief.why) sections.push(`Why we built it:\n${brief.why}`);
  if (brief.previously) sections.push(`How it worked before:\n${brief.previously}`);
  if (brief.whoFor) sections.push(`Who it is for:\n${brief.whoFor}`);
  if (brief.details.length) {
    sections.push(`Specifics (use these verbatim; do not round or embellish):\n${brief.details
      .map((d) => `- ${d}`)
      .join("\n")}`);
  }
  if (brief.availability) sections.push(`Availability:\n${brief.availability}`);
  if (brief.whatsNext) sections.push(`What's next:\n${brief.whatsNext}`);

  return sections.join("\n\n");
}

/** Default article topic when the author did not write one. */
export function productUpdateTopic(brief: ProductUpdateBrief): string {
  const name = brief.productName?.trim();
  const what = brief.whatShipped.trim().replace(/\s+/g, " ");
  const short = what.length > 120 ? `${what.slice(0, 117)}...` : what;
  return name ? `${name}: ${short}` : short;
}

/**
 * Prompt rules for announcement posts.
 *
 * Deliberately inverts the editorial rules: here the brand and its product ARE the subject, and
 * first person about our own work is correct rather than drift.
 */
export const PRODUCT_UPDATE_PROMPT_RULES = `
Product update article (an announcement about our own work):
- The product or feature IS the subject. Writing about what we built, why, and who it helps is correct here — this is not topic drift.
- Speak about the product by name. Do not write around it in generic industry language.
- Structure: what changed, why it needed to change, how it works, who it helps, what is next. Adapt to the facts; skip sections with no material.
- Ground every claim in the supplied brief. Do not invent metrics, dates, customer quotes, limits, or roadmap promises.
- Describe the before state concretely so the improvement is legible.
- No launch-hype register: no "thrilled to announce", "game-changing", "revolutionise", or exclamation-heavy copy.
- Do not add competitor comparisons, pricing claims, or availability dates that are not in the brief.
- Close on what the reader can now do, or what is coming — not a marketing call to action.`;

/** Outline section roles for an announcement, used when no brand archetype applies. */
export const PRODUCT_UPDATE_SECTION_ROLES = [
  "What changed",
  "Why it needed to change",
  "How it works",
  "Who it helps",
  "What's next",
] as const;
