import type { Db } from "mongodb";
import {
  getVoice,
  getWriterArticle,
  listSavedWriterExamplesForVoice,
  upsertWriterArticleDraft,
  writerRewriteInputSchema,
} from "@content-resourcer/db";
import {
  generateArticleRewriteHtml,
  writerArticlesToExamples,
} from "./generate-article-rewrite.js";

export type WriterRewriteBody = {
  voice_id: string;
  organization_id: string;
  created_by: string;
  source_text: string;
  links?: { url: string; label?: string }[];
  writer_article_id?: string;
};

export async function runWriterRewrite(db: Db, body: WriterRewriteBody) {
  const parsed = writerRewriteInputSchema.safeParse({
    voice_id: body.voice_id,
    source_text: body.source_text,
    links: body.links ?? [],
    writer_article_id: body.writer_article_id,
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

  const { voice_id, source_text, links, writer_article_id } = parsed.data;
  const voice = await getVoice(db, voice_id);
  if (!voice || voice.organization_id !== organizationId) {
    throw new Error("voice_not_found");
  }

  if (writer_article_id) {
    const existing = await getWriterArticle(db, writer_article_id, organizationId);
    if (!existing || existing.voice_id !== voice_id) {
      throw new Error("writer_article_not_found");
    }
  }

  const savedExamples = await listSavedWriterExamplesForVoice(db, organizationId, voice_id);
  const examples = writerArticlesToExamples(
    savedExamples.filter((a) => a.id !== writer_article_id),
  );

  const { html, sourceTruncated } = await generateArticleRewriteHtml({
    voice,
    sourceText: source_text,
    links,
    examples,
  });

  const article = await upsertWriterArticleDraft(db, {
    id: writer_article_id,
    organization_id: organizationId,
    voice_id,
    source_text,
    links,
    generated_html: html,
    created_by: createdBy,
  });

  return {
    writer_article_id: article.id,
    generated_html: html,
    source_truncated: sourceTruncated,
  };
}
