import type { Db } from "mongodb";
import {
  getVoice,
  getWriterArticle,
  updateWriterComposeFailed,
  updateWriterComposeResult,
  upsertWriterComposePending,
  writerComposeInputSchema,
  type WriterComposeMeta,
} from "@content-resourcer/db";
import { generateArticleComposeHtml } from "./generate-article-compose.js";
import {
  isWriterComposeJobInFlight,
  runWriterComposeJobExclusive,
} from "./writer-compose-lock.js";
import type { WriterComposeBody } from "./writer-compose.js";

export type StartWriterComposeJobResult = {
  accepted: true;
  writer_article_id: string;
  compose_status: "pending";
};

function resultToComposeMeta(
  result: Awaited<ReturnType<typeof generateArticleComposeHtml>>,
): WriterComposeMeta {
  return {
    references_fetched: result.referencesFetched,
    references_failed: result.referencesFailed,
    user_references_fetched: result.userReferencesFetched,
    web_references_fetched: result.webReferencesFetched,
    web_search_urls: result.webSearchUrls,
    research_questions: result.researchQuestions,
    research_mode: result.researchMode,
    source_truncated: result.sourceTruncated,
    links_requested: result.linksRequested,
    links_present: result.linksPresent,
    links_carried_from_source: result.linksCarriedFromSource,
    links_added: result.linksAdded,
    links_non_requested_in_output: result.linksNonRequestedInOutput,
    links_appended: result.linksAppended,
    links_woven: result.linksWoven,
    links_redistributed: result.linksRedistributed,
    links_revised: result.linksRevised,
    facts_extracted: result.factsExtracted,
    human_authenticity_score: result.humanAuthenticityScore,
    brand_consistency_score: result.brandConsistencyScore,
    genericity_score: result.genericityScore,
    humanization_attempts: result.humanizationAttempts,
  };
}

async function runComposeGeneration(db: Db, body: WriterComposeBody, writerArticleId: string) {
  const parsed = writerComposeInputSchema.safeParse({
    voice_id: body.voice_id,
    topic: body.topic,
    reference_urls: body.reference_urls ?? [],
    links: body.links ?? [],
    writer_article_id: writerArticleId,
    deep_research: body.deep_research,
    web_search: body.web_search,
    web_search_max_queries: body.web_search_max_queries,
    web_search_max_results: body.web_search_max_results,
    article_depth: body.article_depth,
    subtopics: body.subtopics ?? [],
  });
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((i) => i.message).join("; ") || "invalid_input",
    );
  }

  const organizationId = body.organization_id?.trim();
  if (!organizationId) throw new Error("organization_id is required");

  const voice = await getVoice(db, parsed.data.voice_id);
  if (!voice || voice.organization_id !== organizationId) {
    throw new Error("voice_not_found");
  }

  const {
    topic,
    reference_urls,
    links,
    deep_research,
    web_search,
    web_search_max_queries,
    web_search_max_results,
    article_depth,
    subtopics,
  } = parsed.data;

  const result = await generateArticleComposeHtml({
    db,
    organizationId,
    voice,
    topic,
    referenceUrls: reference_urls,
    links,
    writerArticleId,
    deepResearch: deep_research,
    webSearch: web_search,
    webSearchMaxQueries: web_search_max_queries,
    webSearchMaxResults: web_search_max_results,
    articleDepth: article_depth,
    subtopics,
  });

  await updateWriterComposeResult(db, writerArticleId, organizationId, {
    generated_html: result.html,
    research_brief: result.researchBrief,
    compose_meta: resultToComposeMeta(result),
  });
}

export async function startWriterComposeJob(
  db: Db,
  body: WriterComposeBody,
): Promise<StartWriterComposeJobResult> {
  const parsed = writerComposeInputSchema.safeParse({
    voice_id: body.voice_id,
    topic: body.topic,
    reference_urls: body.reference_urls ?? [],
    links: body.links ?? [],
    writer_article_id: body.writer_article_id,
    deep_research: body.deep_research,
    web_search: body.web_search,
    web_search_max_queries: body.web_search_max_queries,
    web_search_max_results: body.web_search_max_results,
    article_depth: body.article_depth,
    subtopics: body.subtopics ?? [],
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "invalid_input";
    throw new Error(msg);
  }

  const organizationId = body.organization_id?.trim();
  const createdBy = body.created_by?.trim();
  if (!organizationId || !createdBy) {
    throw new Error("organization_id and created_by are required");
  }

  const voice = await getVoice(db, parsed.data.voice_id);
  if (!voice || voice.organization_id !== organizationId) {
    throw new Error("voice_not_found");
  }

  if (parsed.data.writer_article_id) {
    const existing = await getWriterArticle(db, parsed.data.writer_article_id, organizationId);
    if (!existing || existing.voice_id !== parsed.data.voice_id || existing.mode !== "compose") {
      throw new Error("writer_article_not_found");
    }
  }

  if (parsed.data.writer_article_id && isWriterComposeJobInFlight(parsed.data.writer_article_id)) {
    throw new Error("compose_already_running");
  }

  const pending = await upsertWriterComposePending(db, {
    id: parsed.data.writer_article_id,
    organization_id: organizationId,
    voice_id: parsed.data.voice_id,
    topic: parsed.data.topic,
    reference_urls: parsed.data.reference_urls,
    links: parsed.data.links,
    created_by: createdBy,
  });

  if (isWriterComposeJobInFlight(pending.id)) {
    throw new Error("compose_already_running");
  }

  void runWriterComposeJobExclusive(pending.id, async () => {
    try {
      await runComposeGeneration(db, body, pending.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await updateWriterComposeFailed(db, pending.id, organizationId, message);
    }
  });

  return {
    accepted: true,
    writer_article_id: pending.id,
    compose_status: "pending",
  };
}
