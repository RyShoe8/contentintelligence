import type { Db } from "mongodb";
import {
  type Voice,
  type WriterLink,
  writerArticleDepthGuidance,
  writerLinksPresentCount,
  writerNonRequestedLinksInHtml,
  writerRequestedLinksAdded,
  writerRequestedLinksCarriedFromSource,
} from "@content-resourcer/db";
import { env } from "./env.js";
import { runHumanizationEngine } from "./services/rewriter/humanization-engine.js";
import { buildReferenceCorpusPrioritized } from "./writer-reference-corpus.js";
import {
  runDeepTopicResearch,
  synthesizeResearchBrief,
} from "./writer-compose-research.js";
import { expandArticleComposeDepth, writerHtmlWordCount } from "./writer-compose-expand.js";
import { planTopicResearch } from "./writer-topic-research-plan.js";
import {
  isWebSearchConfigured,
  resolveWebSearchLimits,
  searchWebForTopic,
} from "./writer-web-search.js";
import { applyWriterLinkPipeline } from "./writer-link-pipeline.js";

export type GenerateArticleComposeOpts = {
  db: Db;
  organizationId: string;
  voice: Voice;
  topic: string;
  referenceUrls: string[];
  links: WriterLink[];
  writerArticleId?: string;
  deepResearch?: boolean;
  webSearch?: boolean;
  webSearchMaxQueries?: number;
  webSearchMaxResults?: number;
  articleDepth?: number;
  subtopics?: string[];
};

export async function generateArticleComposeHtml(opts: GenerateArticleComposeOpts): Promise<{
  html: string;
  researchBrief: string;
  referencesFetched: number;
  referencesFailed: string[];
  userReferencesFetched: number;
  webReferencesFetched: number;
  webSearchUrls: string[];
  researchQuestions: number;
  researchMode: "deep" | "standard";
  sourceTruncated: boolean;
  linksRequested: number;
  linksPresent: number;
  linksCarriedFromSource: number;
  linksAdded: number;
  linksNonRequestedInOutput: number;
  linksAppended: number;
  linksWoven: number;
  linksRedistributed: number;
  linksRevised: boolean;
  factsExtracted: boolean;
  humanAuthenticityScore: number;
  brandConsistencyScore: number;
  genericityScore: number;
  humanizationAttempts: number;
}> {
  if (opts.voice.persona_status !== "ready") {
    throw new Error("voice_persona_not_ready");
  }

  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  const deepResearch = opts.deepResearch !== false;
  const webSearchEnabled =
    opts.webSearch !== false && isWebSearchConfigured();
  const articleDepth = opts.articleDepth ?? 50;
  const depthGuidance = writerArticleDepthGuidance(articleDepth);
  const subtopics = opts.subtopics ?? [];

  const webSearchLimits = resolveWebSearchLimits({
    maxQueries: opts.webSearchMaxQueries,
    maxResults: opts.webSearchMaxResults,
  });

  const needPlan = deepResearch || webSearchEnabled || subtopics.length > 0;
  const plan = needPlan
    ? await planTopicResearch({
        topic: opts.topic,
        voiceKeywords: opts.voice.keywords,
        hasUserReferences: opts.referenceUrls.length > 0,
        maxSearchQueries: webSearchLimits.maxQueries,
        userSubtopics: subtopics,
      })
    : null;

  let webSearchUrls: string[] = [];
  if (webSearchEnabled && plan) {
    const search = await searchWebForTopic(plan.search_queries, opts.referenceUrls, fetch, {
      maxQueries: webSearchLimits.maxQueries,
      maxResults: webSearchLimits.maxResults,
    });
    webSearchUrls = search.urls;
  }

  const corpus = await buildReferenceCorpusPrioritized({
    userUrls: opts.referenceUrls,
    webUrls: webSearchUrls,
  });

  const researchBrief =
    deepResearch && plan
      ? await runDeepTopicResearch({
          topic: opts.topic,
          plan,
          corpusSections: corpus.sections,
          voiceKeywords: opts.voice.keywords,
          articleDepth,
          subtopics,
        })
      : await synthesizeResearchBrief({
          topic: opts.topic,
          corpusSections: corpus.sections,
          voiceKeywords: opts.voice.keywords,
          articleDepth,
          subtopics,
        });

  const sourceTruncated = researchBrief.length > env.maxWriterInputChars;
  let humanized = await runHumanizationEngine({
    db: opts.db,
    voice: opts.voice,
    organizationId: opts.organizationId,
    sourceText: researchBrief,
    links: opts.links,
    writerArticleId: opts.writerArticleId,
    preserveInstructions: false,
    articleDepth,
    subtopics,
    exactLinkLabels: true,
  });

  let pipeline = await applyWriterLinkPipeline(humanized.html, {
    sourceText: researchBrief,
    links: opts.links,
    voice: opts.voice,
    exactAnchorLabels: true,
  });
  let html = pipeline.html;

  const wordCount = writerHtmlWordCount(html);
  if (wordCount < depthGuidance.minWords * 0.85) {
    try {
      const expanded = await expandArticleComposeDepth({
        html,
        researchBrief,
        links: opts.links,
        minWords: depthGuidance.minWords,
        maxWords: depthGuidance.maxWords,
        subtopics,
      });
      pipeline = await applyWriterLinkPipeline(expanded, {
        sourceText: researchBrief,
        links: opts.links,
        voice: opts.voice,
        exactAnchorLabels: true,
      });
      html = pipeline.html;
    } catch {
      // keep pre-expand html if expansion fails
    }
  }

  const sourceTrimmed = researchBrief.trim();

  return {
    html,
    researchBrief,
    referencesFetched: corpus.fetched,
    referencesFailed: corpus.failed,
    userReferencesFetched: corpus.userFetched,
    webReferencesFetched: corpus.webFetched,
    webSearchUrls,
    researchQuestions: plan?.research_questions.length ?? 0,
    researchMode: deepResearch ? "deep" : "standard",
    sourceTruncated,
    linksRequested: opts.links.length,
    linksPresent: writerLinksPresentCount(html, opts.links),
    linksCarriedFromSource: writerRequestedLinksCarriedFromSource(sourceTrimmed, html, opts.links),
    linksAdded: writerRequestedLinksAdded(sourceTrimmed, html, opts.links),
    linksNonRequestedInOutput: writerNonRequestedLinksInHtml(html, opts.links),
    linksAppended: pipeline.linksAppended,
    linksWoven: pipeline.linksWoven,
    linksRedistributed: pipeline.linksRedistributed,
    linksRevised: pipeline.linksRevised,
    factsExtracted: humanized.factsExtracted,
    humanAuthenticityScore: humanized.humanAuthenticityScore,
    brandConsistencyScore: humanized.brandConsistencyScore,
    genericityScore: humanized.genericityScore,
    humanizationAttempts: humanized.humanizationAttempts,
  };
}
