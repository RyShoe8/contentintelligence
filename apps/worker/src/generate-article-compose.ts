import type { Db } from "mongodb";
import {
  type Voice,
  type WriterLink,
  writerArticleDepthGuidance,
  writerComposeResearchConfig,
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
  includeFaq?: boolean;
  skipResearch?: boolean;
  existingResearchBrief?: string;
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

  const skipResearch = opts.skipResearch === true;
  if (skipResearch) {
    const brief = opts.existingResearchBrief?.trim() ?? "";
    if (brief.length === 0) {
      throw new Error("research_brief_empty");
    }
  }

  if (!env.openaiApiKey) {
    throw new Error("openai_not_configured");
  }

  const articleDepth = opts.articleDepth ?? 50;
  const depthGuidance = writerArticleDepthGuidance(articleDepth);
  const subtopics = opts.subtopics ?? [];
  const includeFaq = opts.includeFaq === true;

  let researchBrief: string;
  let referencesFetched = 0;
  let referencesFailed: string[] = [];
  let userReferencesFetched = 0;
  let webReferencesFetched = 0;
  let webSearchUrls: string[] = [];
  let researchQuestions = 0;
  let researchMode: "deep" | "standard" = "standard";
  let sourceTruncated = false;

  if (skipResearch) {
    researchBrief = opts.existingResearchBrief!.trim();
    sourceTruncated = researchBrief.length > env.maxWriterInputChars;
  } else {
    const deepResearch = opts.deepResearch !== false;
    const webSearchEnabled =
      opts.webSearch !== false && isWebSearchConfigured();

    const webSearchLimits = resolveWebSearchLimits({
      maxQueries: opts.webSearchMaxQueries,
      maxResults: opts.webSearchMaxResults,
    });

    const needPlan = deepResearch || webSearchEnabled || subtopics.length > 0;
    const researchConfig = writerComposeResearchConfig(articleDepth);
    const plan = needPlan
      ? await planTopicResearch({
          topic: opts.topic,
          voiceKeywords: opts.voice.keywords,
          hasUserReferences: opts.referenceUrls.length > 0,
          maxSearchQueries: Math.min(webSearchLimits.maxQueries, researchConfig.maxSearchQueries),
          userSubtopics: subtopics,
          articleDepth,
        })
      : null;

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

    researchBrief =
      deepResearch && plan
        ? await runDeepTopicResearch({
            topic: opts.topic,
            plan,
            corpusSections: corpus.sections,
            voiceKeywords: opts.voice.keywords,
            articleDepth,
            subtopics,
            includeFaq,
          })
        : await synthesizeResearchBrief({
            topic: opts.topic,
            corpusSections: corpus.sections,
            voiceKeywords: opts.voice.keywords,
            articleDepth,
            subtopics,
            includeFaq,
          });

    referencesFetched = corpus.fetched;
    referencesFailed = corpus.failed;
    userReferencesFetched = corpus.userFetched;
    webReferencesFetched = corpus.webFetched;
    researchQuestions = plan?.research_questions.length ?? 0;
    researchMode = deepResearch ? "deep" : "standard";
    sourceTruncated = researchBrief.length > env.maxWriterInputChars;
  }

  const sourceTruncatedFinal = sourceTruncated;
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
    composeMode: true,
    topic: opts.topic,
    includeFaq,
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
        topic: opts.topic,
        includeFaq,
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
    referencesFetched,
    referencesFailed,
    userReferencesFetched,
    webReferencesFetched,
    webSearchUrls,
    researchQuestions,
    researchMode,
    sourceTruncated: sourceTruncatedFinal,
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
