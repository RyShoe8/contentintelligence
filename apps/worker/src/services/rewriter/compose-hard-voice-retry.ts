import {
  COMPOSE_POST_LINK_HARD_MAX,
  collectComposeHardVoiceRetryIssues,
  hasComposeHardVoiceFailures,
  stripLeadingComposeChrome,
  type ContentFacts,
  type WriterLink,
} from "@content-resourcer/db";
import type { ComposeArticleType, Voice } from "@content-resourcer/db";
import { resolveVoiceGenerationContext } from "../../voice-generation-context.js";
import { interpretBrand } from "./brand-interpreter.js";
import {
  resolveComposeArticleArchetype,
  resolvePrimaryKitRhythm,
} from "./compose-article-archetype.js";
import {
  applyManifestoArchetypeOverride,
  buildComposeHowToOutline,
  planComposeOutline,
} from "./compose-outline.js";
import { humanizeArticleHtml } from "./humanizer.js";
import { reconstructArticleHtml } from "./reconstruction.js";
import type { ArticleRewriteExample } from "./types.js";

export type ComposeHardVoiceFixLoopOpts = {
  voice: Voice;
  html: string;
  topic: string;
  includeFaq: boolean;
  facts: ContentFacts;
  examples: ArticleRewriteExample[];
  links: WriterLink[];
  articleDepth?: number;
  subtopics?: string[];
  styleExampleExcerpt?: string;
  knownExampleTitles?: string[];
  articleType?: ComposeArticleType;
};

function hasHeadingHardFailures(issues: string[]): boolean {
  return issues.some(
    (issue) =>
      /heading/i.test(issue) ||
      /research-brief section heading/i.test(issue) ||
      /FAQ section title/i.test(issue) ||
      /ordered list/i.test(issue) ||
      /essay heading/i.test(issue) ||
      /procedural sections/i.test(issue),
  );
}

/** Post-link loop: reconstruct when headings fail, humanize polish otherwise. */
export async function runComposeHardVoiceFixLoop(
  opts: ComposeHardVoiceFixLoopOpts,
): Promise<string> {
  let html = opts.html;
  const ctx = resolveVoiceGenerationContext(opts.voice);
  const gateOpts = {
    includeFaq: opts.includeFaq,
    knownExampleTitles: opts.knownExampleTitles,
    faqItems: opts.facts.faqItems,
    articleType: opts.articleType,
    topic: opts.topic,
    brandName: ctx.brandName,
    brandMentionLevel: ctx.brandMentionLevel,
  };

  const composeRhythm = resolvePrimaryKitRhythm(opts.examples);

  for (let attempt = 0; attempt < COMPOSE_POST_LINK_HARD_MAX; attempt++) {
    if (!hasComposeHardVoiceFailures(html, gateOpts)) return html;

    const hardIssues = collectComposeHardVoiceRetryIssues(html, gateOpts);
    if (!hardIssues.length) return html;

    if (hasHeadingHardFailures(hardIssues)) {
      const interpretation = await interpretBrand(opts.facts, ctx, {
        composeMode: true,
        topic: opts.topic,
      });
      const composeArchetype = applyManifestoArchetypeOverride(
        resolveComposeArticleArchetype(opts.examples),
        opts.topic,
      );
      const composeHowTo = opts.articleType === "how_to";
      const composeOutline = composeHowTo
        ? buildComposeHowToOutline({
            topic: opts.topic,
            facts: opts.facts,
            subtopics: opts.subtopics,
          })
        : await planComposeOutline({
            topic: opts.topic,
            subtopics: opts.subtopics,
            keyDetails: opts.facts.keyDetails,
            faqItems: opts.facts.faqItems,
            includeFaq: opts.includeFaq,
            examples: opts.examples,
          });

      html = await reconstructArticleHtml({
        voice: opts.voice,
        ctx,
        facts: opts.facts,
        interpretation,
        examples: opts.examples,
        links: opts.links,
        retryIssues: hardIssues,
        attempt: attempt + 2,
        articleDepth: opts.articleDepth,
        subtopics: opts.subtopics,
        exactLinkLabels: false,
        composeMode: true,
        topic: opts.topic,
        includeFaq: opts.includeFaq,
        composeOutline,
        composeArchetype,
        articleType: opts.articleType,
      });
      html = await humanizeArticleHtml({
        voice: opts.voice,
        html,
        retryIssues: hardIssues,
        attempt: attempt + 2,
        composeMode: true,
        topic: opts.topic,
        styleExampleExcerpt: opts.styleExampleExcerpt,
        includeFaq: opts.includeFaq,
        composeArchetype,
        composeRhythm,
      });
      html = stripLeadingComposeChrome(html);
    } else {
      const composeArchetype = applyManifestoArchetypeOverride(
        resolveComposeArticleArchetype(opts.examples),
        opts.topic,
      );
      html = await humanizeArticleHtml({
        voice: opts.voice,
        html,
        retryIssues: hardIssues,
        attempt: attempt + 2,
        composeMode: true,
        topic: opts.topic,
        styleExampleExcerpt: opts.styleExampleExcerpt,
        includeFaq: opts.includeFaq,
        composeArchetype,
        composeRhythm,
      });
      html = stripLeadingComposeChrome(html);
    }
  }

  return html;
}
