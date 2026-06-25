import type { Db } from "mongodb";
import {
  getVoice,
  getWriterArticle,
  upsertWriterArticleDraft,
  writerComposeInputSchema,
} from "@content-resourcer/db";
import { generateArticleComposeHtml } from "./generate-article-compose.js";

export type WriterComposeBody = {
  voice_id: string;
  organization_id: string;
  created_by: string;
  topic: string;
  reference_urls?: string[];
  links?: { url: string; label?: string }[];
  writer_article_id?: string;
  deep_research?: boolean;
  web_search?: boolean;
  web_search_max_queries?: number;
  web_search_max_results?: number;
  article_depth?: number;
  subtopics?: string[];
  include_faq?: boolean;
  article_type?: "editorial" | "how_to";
  skip_research?: boolean;
  research_brief?: string;
};

export async function runWriterCompose(db: Db, body: WriterComposeBody) {
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
    include_faq: body.include_faq,
    article_type: body.article_type,
    skip_research: body.skip_research,
    research_brief: body.research_brief,
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

  const {
    voice_id,
    topic,
    reference_urls,
    links,
    writer_article_id,
    deep_research,
    web_search,
    web_search_max_queries,
    web_search_max_results,
    article_depth,
    subtopics,
    include_faq,
    article_type,
  } = parsed.data;
  const voice = await getVoice(db, voice_id);
  if (!voice || voice.organization_id !== organizationId) {
    throw new Error("voice_not_found");
  }

  if (writer_article_id) {
    const existing = await getWriterArticle(db, writer_article_id, organizationId);
    if (!existing || existing.voice_id !== voice_id || existing.mode !== "compose") {
      throw new Error("writer_article_not_found");
    }
  }

  const result = await generateArticleComposeHtml({
    db,
    organizationId,
    voice,
    topic,
    referenceUrls: reference_urls,
    links,
    writerArticleId: writer_article_id,
    deepResearch: deep_research,
    webSearch: web_search,
    webSearchMaxQueries: web_search_max_queries,
    webSearchMaxResults: web_search_max_results,
    articleDepth: article_depth,
    subtopics,
    includeFaq: include_faq,
    articleType: article_type,
  });

  const article = await upsertWriterArticleDraft(db, {
    id: writer_article_id,
    organization_id: organizationId,
    voice_id,
    mode: "compose",
    topic,
    reference_urls,
    source_text: result.researchBrief,
    links,
    generated_html: result.html,
    created_by: createdBy,
  });

  return {
    writer_article_id: article.id,
    generated_html: result.html,
    research_brief: result.researchBrief,
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
