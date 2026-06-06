import type { Db } from "mongodb";
import {
  type Voice,
  type WriterLink,
  writerLinksPresentCount,
  writerNonRequestedLinksInHtml,
  writerRequestedLinksAdded,
  writerRequestedLinksCarriedFromSource,
} from "@content-resourcer/db";
import { env } from "./env.js";
import { runHumanizationEngine } from "./services/rewriter/humanization-engine.js";
import { buildReferenceCorpus } from "./writer-reference-corpus.js";
import { synthesizeResearchBrief } from "./writer-compose-research.js";
import { applyWriterLinkPipeline } from "./writer-link-pipeline.js";

export type GenerateArticleComposeOpts = {
  db: Db;
  organizationId: string;
  voice: Voice;
  topic: string;
  referenceUrls: string[];
  links: WriterLink[];
  writerArticleId?: string;
};

export async function generateArticleComposeHtml(opts: GenerateArticleComposeOpts): Promise<{
  html: string;
  researchBrief: string;
  referencesFetched: number;
  referencesFailed: string[];
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

  const corpus = await buildReferenceCorpus(opts.referenceUrls);
  const researchBrief = await synthesizeResearchBrief({
    topic: opts.topic,
    corpusSections: corpus.sections,
    voiceKeywords: opts.voice.keywords,
  });

  const sourceTruncated = researchBrief.length > env.maxWriterInputChars;
  const humanized = await runHumanizationEngine({
    db: opts.db,
    voice: opts.voice,
    organizationId: opts.organizationId,
    sourceText: researchBrief,
    links: opts.links,
    writerArticleId: opts.writerArticleId,
    preserveInstructions: false,
  });

  const pipeline = await applyWriterLinkPipeline(humanized.html, {
    sourceText: researchBrief,
    links: opts.links,
    voice: opts.voice,
  });
  const html = pipeline.html;
  const sourceTrimmed = researchBrief.trim();

  return {
    html,
    researchBrief,
    referencesFetched: corpus.fetched,
    referencesFailed: corpus.failed,
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
