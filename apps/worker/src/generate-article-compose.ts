import type { Db } from "mongodb";
import {
  listWriterStyleExamplesForVoice,
  buildProductUpdateBrief,
  isProductUpdateArticleType,
  resolveComposeArticleType,
  updateWriterComposeResearchCheckpoint,
  type ComposeArticleType,
  type ProductUpdateBrief,
  type Voice,
  type WriterLink,
  REWRITER_COMPOSE_GENERICITY_MAX,
  hasComposeHardVoiceFailures,
  scoreVoiceFidelity,
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
  shouldRunComposeFinalPolish,
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
import { preprocessResearchBriefForVoice } from "./services/rewriter/compose-voice-brief.js";
import { resolveVoiceGenerationContext } from "./voice-generation-context.js";
import { composeRewritePassBudget, voiceFidelityMin } from "./services/llm/model-registry.js";
import { resolveComposeVoiceProfile } from "./services/rewriter/compose-voice-rules.js";
import {
  extractComposeStyleKitDeterministic,
  summarizeComposeStyleKits,
} from "./services/rewriter/extract-compose-style-kit.js";
import { runComposeHardVoiceFixLoop } from "./services/rewriter/compose-hard-voice-retry.js";
import {
  loadPrimaryStyleExampleForTransfer,
  runStyleTransferPass,
  shouldRunStyleTransfer,
} from "./services/rewriter/style-transfer.js";
import {
  resolveComposeArticleArchetype,
  resolvePrimaryKitRhythm,
} from "./services/rewriter/compose-article-archetype.js";
import { applyManifestoArchetypeOverride } from "./services/rewriter/compose-outline.js";

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
  articleType?: ComposeArticleType;
  skipResearch?: boolean;
  existingResearchBrief?: string;
  /** Structured facts for product_update articles — replaces web research entirely. */
  productBrief?: ProductUpdateBrief;
};

async function postExpandComposeVoicePolish(opts: {
  voice: Voice;
  html: string;
  topic: string;
  includeFaq: boolean;
  voicePerson?: "first_plural" | "first_singular" | "second" | "third";
  styleExampleExcerpt?: string;
  knownExampleTitles?: string[];
  faqItems?: { question: string; answer: string }[];
  composeArchetype?: ReturnType<typeof resolveComposeArticleArchetype>;
  composeRhythm?: ReturnType<typeof resolvePrimaryKitRhythm>;
}): Promise<string> {
  let html = await polishComposeHtmlVoice({
    voice: opts.voice,
    html: opts.html,
    topic: opts.topic,
    includeFaq: opts.includeFaq,
    styleExampleExcerpt: opts.styleExampleExcerpt,
    composeArchetype: opts.composeArchetype,
    composeRhythm: opts.composeRhythm,
  });

  const voiceIssues = [
    ...writerComposeVoiceStyleIssues(html),
    ...writerComposeOperatorVoiceIssues(html, { person: opts.voicePerson }),
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
      composeArchetype: opts.composeArchetype,
      composeRhythm: opts.composeRhythm,
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
  voiceFidelityScore: number;
  voiceFidelityMeasured: boolean;
  composeRewritePassesUsed: number;
}> {
  if (opts.voice.persona_status !== "ready") {
    throw new Error("voice_persona_not_ready");
  }

  /**
   * Product updates never run external research: the facts are supplied by the author, and web
   * search on "our new feature" returns nothing relevant at best and unrelated vendors at worst.
   */
  const isProductUpdate = isProductUpdateArticleType(opts.articleType);
  if (isProductUpdate && !opts.productBrief) {
    throw new Error("product_brief_required");
  }
  const skipResearch = isProductUpdate || opts.skipResearch === true;
  if (skipResearch && !isProductUpdate) {
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
  const articleType = resolveComposeArticleType(opts.articleType, opts.topic, subtopics);

  let researchBrief: string;
  let referencesFetched = 0;
  let referencesFailed: string[] = [];
  let userReferencesFetched = 0;
  let webReferencesFetched = 0;
  let webSearchUrls: string[] = [];
  let researchQuestions = 0;
  let researchMode: "deep" | "standard" = "standard";
  let sourceTruncated = false;

  if (isProductUpdate) {
    researchBrief = buildProductUpdateBrief(opts.productBrief!);
    sourceTruncated = false;
  } else if (skipResearch) {
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

    /**
     * Research only produces editorial or how-to briefs. Product updates never reach this
     * branch — they supply their own facts — so the narrower type is safe here.
     */
    const researchArticleType: "editorial" | "how_to" =
      articleType === "how_to" ? "how_to" : "editorial";

    const needPlan = deepResearch || webSearchEnabled || subtopics.length > 0;
    const researchConfig = writerComposeResearchConfig(articleDepth);
    const plan = needPlan
      ? await planTopicResearch({
          topic: opts.topic,
          hasUserReferences: opts.referenceUrls.length > 0,
          maxSearchQueries: Math.min(webSearchLimits.maxQueries, researchConfig.maxSearchQueries),
          userSubtopics: subtopics,
          articleDepth,
          articleType: researchArticleType,
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
            articleType: researchArticleType,
          })
        : await synthesizeResearchBrief({
            topic: opts.topic,
            corpusSections: corpus.sections,
            articleDepth,
            subtopics,
            includeFaq,
            articleType: researchArticleType,
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
  const rawResearchBrief = researchBrief;

  if (!skipResearch && opts.writerArticleId && rawResearchBrief.trim()) {
    await updateWriterComposeResearchCheckpoint(
      opts.db,
      opts.writerArticleId,
      opts.organizationId,
      { research_brief: rawResearchBrief },
    );
  }

  const styleArticles = await listWriterStyleExamplesForVoice(
    opts.db,
    opts.organizationId,
    opts.voice.id,
  );
  const styleKits = styleArticles.slice(0, 3).map((article) => {
    const html = article.final_html?.trim() ?? "";
    return (
      article.compose_style_kit ??
      (html ? extractComposeStyleKitDeterministic(html) : undefined)
    );
  }).filter((kit): kit is NonNullable<typeof kit> => kit != null);
  const styleKitSummary = summarizeComposeStyleKits(styleKits);

  /**
   * Product update briefs are already the author's own words and are short, so the voice
   * preprocessing pass would only paraphrase them and strip the labelled structure the writer
   * relies on. Skipping it also saves a lossy rewrite.
   */
  const voiceResearchBrief = isProductUpdate
    ? rawResearchBrief
    : await preprocessResearchBriefForVoice({
        voice: opts.voice,
        topic: opts.topic,
        researchBrief: rawResearchBrief,
        styleKitSummary,
        includeFaq,
        howToTopic: articleType === "how_to",
        subtopics,
      });

  let humanized = await runHumanizationEngine({
    db: opts.db,
    voice: opts.voice,
    organizationId: opts.organizationId,
    sourceText: voiceResearchBrief,
    links: opts.links,
    writerArticleId: opts.writerArticleId,
    preserveInstructions: false,
    articleDepth,
    subtopics,
    exactLinkLabels: false,
    composeMode: true,
    topic: opts.topic,
    includeFaq,
    articleType,
    sourceProse: voiceResearchBrief,
    voiceProfile: resolveComposeVoiceProfile(opts.voice),
    voiceFidelityMin: voiceFidelityMin(),
  });

  const styleExampleExcerpt = buildComposeStyleExampleExcerpt(humanized.examples);
  const knownExampleTitles = humanized.examples.map((ex) => ex.title).filter(Boolean);
  const voiceCtx = resolveVoiceGenerationContext(opts.voice);
  const voiceProfileForGates = resolveComposeVoiceProfile(opts.voice, humanized.examples);
  const voicePerson =
    voiceProfileForGates.sampleCount > 0 ? voiceProfileForGates.person : undefined;
  const composeGateOpts = {
    includeFaq,
    knownExampleTitles,
    faqItems: humanized.facts.faqItems,
    brandName: voiceCtx.brandName,
    brandMentionLevel: voiceCtx.brandMentionLevel,
    articleType,
    topic: opts.topic,
    person: voicePerson,
  };
  const composeArchetype = applyManifestoArchetypeOverride(
    resolveComposeArticleArchetype(humanized.examples),
    opts.topic,
  );
  const composeRhythm = resolvePrimaryKitRhythm(humanized.examples);

  let pipeline = await applyWriterLinkPipeline(humanized.html, {
    sourceText: voiceResearchBrief,
    links: opts.links,
    voice: opts.voice,
    exactAnchorLabels: false,
    allowAppendedLinks: false,
  });
  let html = pipeline.html;
  let expanded = false;

  /**
   * Budget for whole-article rewrite passes after the first draft.
   *
   * The pipeline previously ran polish, hard-voice repair, a second polish and a style transfer
   * unconditionally-ish, so a single article could be rewritten end to end six or more times.
   * Each rewrite is a lossy re-encode that regresses prose toward the model's average, which is
   * a large part of why output read generic regardless of voice configuration. Passes are now
   * spent in order of value and stop when the budget runs out.
   */
  let passesRemaining = composeRewritePassBudget();
  const spendPass = (): boolean => {
    if (passesRemaining <= 0) return false;
    passesRemaining--;
    return true;
  };

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
        voice: opts.voice,
      });
      pipeline = await applyWriterLinkPipeline(expandedHtml, {
        sourceText: voiceResearchBrief,
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

  // Expansion already rewrote the whole article, so it costs a pass.
  if (expanded) passesRemaining = Math.max(0, passesRemaining - 1);

  const voiceProfile = voiceProfileForGates;
  const fidelityFloor = voiceFidelityMin();

  /**
   * Pass 1 — hard voice failures.
   *
   * Highest value repair: structural voice breaks (leaked reference titles, forbidden FAQ
   * headings, brand-as-subject drift) that a reader would notice immediately.
   */
  if (hasComposeHardVoiceFailures(html, composeGateOpts) && spendPass()) {
    html = await runComposeHardVoiceFixLoop({
      voice: opts.voice,
      html,
      topic: opts.topic,
      includeFaq,
      facts: humanized.facts,
      examples: humanized.examples,
      links: opts.links,
      articleDepth,
      subtopics,
      styleExampleExcerpt,
      knownExampleTitles,
      articleType,
    });
    html = stripLeadingComposeChrome(html);
  }

  /**
   * Pass 2 — voice fidelity.
   *
   * Style transfer against the brand's own primary example is the only pass that reliably
   * moves fidelity, so it is preferred over generic polish whenever fidelity is short.
   */
  const midFidelity = scoreVoiceFidelity(html, voiceProfile);
  const fidelityShort = midFidelity.measured && midFidelity.score < fidelityFloor;
  if (fidelityShort) {
    const primaryStyle = await loadPrimaryStyleExampleForTransfer(
      opts.db,
      opts.organizationId,
      opts.voice,
    );
    if (shouldRunStyleTransfer(primaryStyle?.html) && spendPass()) {
      html = await runStyleTransferPass({
        voice: opts.voice,
        html,
        referenceHtml: primaryStyle!.html,
        referenceTitle: primaryStyle!.title,
        composeStyleKit: primaryStyle!.composeStyleKit,
        topic: opts.topic,
        includeFaq,
        knownExampleTitles,
        links: opts.links,
        composeMode: true,
      });
      html = stripLeadingComposeChrome(html);
    }
  }

  /**
   * Pass 3 — generic polish.
   *
   * Lowest value and the most homogenising, so it only runs with budget left over and only
   * when link weaving or a style/genericity check actually flagged something.
   */
  if (passesRemaining > 0) {
    const polishGenericity = await analyzeGenericity(html);
    const needsPolish =
      shouldRunComposeVoicePolish({
        linksWoven: pipeline.linksWoven,
        linksRevised: pipeline.linksRevised,
        styleIssueCounts: writerComposeStyleIssueCounts(html, composeGateOpts),
        genericityScore: polishGenericity.score,
      }) ||
      shouldRunComposeFinalPolish({
        html,
        genericityScore: polishGenericity.score,
        composeGateOpts,
      });
    if (needsPolish && spendPass()) {
      html = await postExpandComposeVoicePolish({
        voice: opts.voice,
        html,
        topic: opts.topic,
        includeFaq,
        styleExampleExcerpt,
        knownExampleTitles,
        faqItems: humanized.facts.faqItems,
        composeArchetype,
        composeRhythm,
        voicePerson,
      });
      html = stripLeadingComposeChrome(html);
    }
  }

  html = stripLeadingComposeChrome(html);

  const finalGenericity = await analyzeGenericity(html);
  const finalFidelity = scoreVoiceFidelity(html, voiceProfile);
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
    voiceFidelity: finalFidelity,
    voiceFidelityMin: fidelityFloor,
  });

  const sourceTrimmed = rawResearchBrief.trim();

  return {
    html,
    researchBrief: rawResearchBrief,
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
    voiceFidelityScore: finalFidelity.score,
    voiceFidelityMeasured: finalFidelity.measured,
    composeRewritePassesUsed: composeRewritePassBudget() - passesRemaining,
  };
}
