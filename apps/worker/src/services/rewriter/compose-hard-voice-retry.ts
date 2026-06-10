import {
  COMPOSE_POST_LINK_HARD_MAX,
  collectComposeHardVoiceRetryIssues,
  hasComposeHardVoiceFailures,
  stripLeadingComposeChrome,
  type ContentFacts,
  type WriterLink,
} from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import { resolveVoiceGenerationContext } from "../../voice-generation-context.js";
import { interpretBrand } from "./brand-interpreter.js";
import {
  extractStyleExampleHeadings,
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
};

function hasHeadingHardFailures(issues: string[]): boolean {
  return issues.some(
    (issue) =>
      /heading/i.test(issue) ||
      /research-brief section heading/i.test(issue) ||
      /FAQ section title/i.test(issue),
  );
}

/** Post-link loop: reconstruct when headings fail, humanize polish otherwise. */
export async function runComposeHardVoiceFixLoop(
  opts: ComposeHardVoiceFixLoopOpts,
): Promise<string> {
  let html = opts.html;
  const gateOpts = {
    includeFaq: opts.includeFaq,
    knownExampleTitles: opts.knownExampleTitles,
    faqItems: opts.facts.faqItems,
  };

  for (let attempt = 0; attempt < COMPOSE_POST_LINK_HARD_MAX; attempt++) {
    if (!hasComposeHardVoiceFailures(html, gateOpts)) return html;

    const hardIssues = collectComposeHardVoiceRetryIssues(html, gateOpts);
    if (!hardIssues.length) return html;

    if (hasHeadingHardFailures(hardIssues)) {
      const ctx = resolveVoiceGenerationContext(opts.voice);
      const interpretation = await interpretBrand(opts.facts, ctx, {
        composeMode: true,
        topic: opts.topic,
      });
      const composeOutline = await planComposeOutline({
        topic: opts.topic,
        subtopics: opts.subtopics,
        keyDetails: opts.facts.keyDetails,
        faqItems: opts.facts.faqItems,
        styleHeadings: extractStyleExampleHeadings(opts.examples),
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
      });
      html = stripLeadingComposeChrome(html);
    } else {
      html = await humanizeArticleHtml({
        voice: opts.voice,
        html,
        retryIssues: hardIssues,
        attempt: attempt + 2,
        composeMode: true,
        topic: opts.topic,
        styleExampleExcerpt: opts.styleExampleExcerpt,
        includeFaq: opts.includeFaq,
      });
      html = stripLeadingComposeChrome(html);
    }
  }

  return html;
}
