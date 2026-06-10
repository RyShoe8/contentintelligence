import type { Db } from "mongodb";
import {
  type Voice,
  type WriterLink,
  REWRITER_COMPOSE_GENERICITY_MAX,
  stripLeadingComposeChrome,
  writerArticleDepthGuidance,
  writerComposeResearchConfig,
  writerComposeFaqStyleIssues,
  writerComposeOperatorVoiceIssues,
  writerComposeReferenceLeakIssues,
  writerComposeStyleIssueCounts,
  writerComposeVoiceStyleIssues,
  writerLinksPresentCount,
  writerNonRequestedLinksInHtml,
  writerRequestedLinksAdded,
  writerRequestedLinksCarriedFromSource,
} from "@content-resourcer/db";
import { env } from "./env.js";
import {
  buildComposeStyleExampleExcerpt,
  polishComposeHtmlVoice,
  runHumanizationEngine,
} from "./services/rewriter/humanization-engine.js";
import { analyzeGenericity } from "./services/rewriter/generic-detector.js";
import {
  evaluateComposeVoiceQuality,
  shouldRunComposeVoicePolish,
} from "./services/rewriter/compose-voice-quality.js";
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

async function postExpandComposeVoicePolish(opts: {
  voice: Voice;
  html: string;
  topic: string;
  includeFaq: boolean;
  styleExampleExcerpt?: string;
  knownExampleTitles?: string[];
  faqItems?: { question: string; answer: string }[];
}): Promise<string> {
  let html = await polishComposeHtmlVoice({
    voice: opts.voice,
    html: opts.html,
    topic: opts.topic,
    includeFaq: opts.includeFaq,
    styleExampleExcerpt: opts.styleExampleExcerpt,
  });

  const voiceIssues = [
    ...writerComposeVoiceStyleIssues(html),
    ...writerComposeOperatorVoiceIssues(html),
    ...writerComposeReferenceLeakIssues(html, opts.knownExampleTitles),
    ...(opts.includeFaq ? writerComposeFaqStyleIssues(html, opts.faqItems ?? []) : []),
  ];
  const genericity = await analyzeGenericity(html);
  const genericityHigh = genericity.score > REWRITER_COMPOSE_GENERICITY_MAX;

  if (voiceIssues.length || genericityHigh) {
    const retryIssues = [
      ...voiceIssues,
      ...(genericityHigh
        ? [`Genericity score ${genericity.score} — reduce neutral industry-guide tone`]
        : []),
    ];
    html = await polishComposeHtmlVoice({
      voice: opts.voice,
      html,
      topic: opts.topic,
      includeFaq: opts.includeFaq,
      styleExampleExcerpt: opts.styleExampleExcerpt,
      retryIssues,
    });
  }

  return html;
}

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
  voiceQualityWarning?: string;
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
            articleDepth,
            subtopics,
            includeFaq,
          })
        : await synthesizeResearchBrief({
            topic: opts.topic,
            corpusSections: corpus.sections,
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
    exactLinkLabels: false,
    composeMode: true,
    topic: opts.topic,
    includeFaq,
  });

  const styleExampleExcerpt = buildComposeStyleExampleExcerpt(humanized.examples);
  const knownExampleTitles = humanized.examples.map((ex) => ex.title).filter(Boolean);

  let pipeline = await applyWriterLinkPipeline(humanized.html, {
    sourceText: researchBrief,
    links: opts.links,
    voice: opts.voice,
    exactAnchorLabels: false,
    allowAppendedLinks: false,
  });
  let html = pipeline.html;
  let expanded = false;

  const wordCount = writerHtmlWordCount(html);
  if (wordCount < depthGuidance.minWords * 0.85) {
    try {
      const expandedHtml = await expandArticleComposeDepth({
        html,
        facts: humanized.facts,
        links: opts.links,
        minWords: depthGuidance.minWords,
        maxWords: depthGuidance.maxWords,
        subtopics,
        topic: opts.topic,
        includeFaq,
      });
      pipeline = await applyWriterLinkPipeline(expandedHtml, {
        sourceText: researchBrief,
        links: opts.links,
        voice: opts.voice,
        exactAnchorLabels: false,
        allowAppendedLinks: false,
      });
      html = pipeline.html;
      expanded = true;
    } catch {
      // keep pre-expand html if expansion fails
    }
  }

  if (expanded) {
    html = await postExpandComposeVoicePolish({
      voice: opts.voice,
      html,
      topic: opts.topic,
      includeFaq,
      styleExampleExcerpt,
      knownExampleTitles,
      faqItems: humanized.facts.faqItems,
    });
  } else {
    const composeGateOpts = {
      includeFaq,
      knownExampleTitles,
      faqItems: humanized.facts.faqItems,
    };
    const prePolishStyleCounts = writerComposeStyleIssueCounts(html, composeGateOpts);
    let needsPolish = shouldRunComposeVoicePolish({
      linksWoven: pipeline.linksWoven,
      linksRevised: pipeline.linksRevised,
      styleIssueCounts: prePolishStyleCounts,
      genericityScore: 0,
    });
    if (!needsPolish) {
      const prePolishGenericity = await analyzeGenericity(html);
      needsPolish = shouldRunComposeVoicePolish({
        linksWoven: pipeline.linksWoven,
        linksRevised: pipeline.linksRevised,
        styleIssueCounts: prePolishStyleCounts,
        genericityScore: prePolishGenericity.score,
      });
    }
    if (needsPolish) {
      html = await postExpandComposeVoicePolish({
        voice: opts.voice,
        html,
        topic: opts.topic,
        includeFaq,
        styleExampleExcerpt,
        knownExampleTitles,
        faqItems: humanized.facts.faqItems,
      });
    }
  }

  html = stripLeadingComposeChrome(html);
  const composeGateOpts = {
    includeFaq,
    knownExampleTitles,
    faqItems: humanized.facts.faqItems,
  };
  const finalGenericity = await analyzeGenericity(html);
  const finalQuality = evaluateComposeVoiceQuality({
    facts: humanized.facts,
    html,
    critique: {
      humanAuthenticity: humanized.humanAuthenticityScore,
      brandConsistency: humanized.brandConsistencyScore,
      genericity: humanized.genericityScore,
      issues: [],
    },
    genericity: finalGenericity,
    composeGateOpts,
  });

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
    brandConsistencyScore: finalQuality.brandConsistencyScore,
    genericityScore: finalQuality.genericityScore,
    humanizationAttempts: humanized.humanizationAttempts,
    voiceQualityWarning: finalQuality.voiceQualityWarning,
  };
}
