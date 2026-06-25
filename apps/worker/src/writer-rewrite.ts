import type { Db } from "mongodb";
import {
  getVoice,
  getWriterArticle,
  writerRewriteInputSchema,
} from "@content-resourcer/db";
import { generateArticleRewriteHtml } from "./generate-article-rewrite.js";

export type WriterRewriteBody = {
  voice_id: string;
  organization_id: string;
  created_by: string;
  source_text: string;
  links?: { url: string; label?: string }[];
  writer_article_id?: string;
  rewrite_divergence_min?: number;
  preserve_instructions?: boolean;
};

export async function runWriterRewrite(db: Db, body: WriterRewriteBody) {
  const parsed = writerRewriteInputSchema.safeParse({
    voice_id: body.voice_id,
    source_text: body.source_text,
    links: body.links ?? [],
    writer_article_id: body.writer_article_id,
    rewrite_divergence_min: body.rewrite_divergence_min,
    preserve_instructions: body.preserve_instructions,
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
    source_text,
    links,
    writer_article_id,
    rewrite_divergence_min,
    preserve_instructions,
  } = parsed.data;
  const voice = await getVoice(db, voice_id);
  if (!voice || voice.organization_id !== organizationId) {
    throw new Error("voice_not_found");
  }

  if (writer_article_id) {
    const existing = await getWriterArticle(db, writer_article_id, organizationId);
    if (!existing || existing.voice_id !== voice_id || existing.mode !== "rewrite") {
      throw new Error("writer_article_not_found");
    }
  }

  const {
    html,
    sourceTruncated,
    linksRequested,
    linksPresent,
    linksCarriedFromSource,
    linksAdded,
    linksNonRequestedInOutput,
    linksAppended,
    linksWoven,
    linksRedistributed,
    linksRevised,
    rewriteDivergenceScore,
    rewriteDivergenceMin,
    rewriteDivergenceBelowMin,
    rewriteDivergenceAttempts,
    factsExtracted,
    humanAuthenticityScore,
    brandConsistencyScore,
    genericityScore,
    humanizationAttempts,
  } = await generateArticleRewriteHtml({
    db,
    organizationId,
    voice,
    sourceText: source_text,
    links,
    writerArticleId: writer_article_id,
    rewriteDivergenceMin: rewrite_divergence_min,
    preserveInstructions: preserve_instructions,
  });

  return {
    writer_article_id,
    generated_html: html,
    source_truncated: sourceTruncated,
    links_requested: linksRequested,
    links_present: linksPresent,
    links_carried_from_source: linksCarriedFromSource,
    links_added: linksAdded,
    links_non_requested_in_output: linksNonRequestedInOutput,
    links_appended: linksAppended,
    links_woven: linksWoven,
    links_redistributed: linksRedistributed,
    links_revised: linksRevised,
    rewrite_divergence_score: rewriteDivergenceScore,
    rewrite_divergence_min: rewriteDivergenceMin,
    rewrite_divergence_below_min: rewriteDivergenceBelowMin,
    rewrite_divergence_attempts: rewriteDivergenceAttempts,
    facts_extracted: factsExtracted,
    human_authenticity_score: humanAuthenticityScore,
    brand_consistency_score: brandConsistencyScore,
    genericity_score: genericityScore,
    humanization_attempts: humanizationAttempts,
  };
}
