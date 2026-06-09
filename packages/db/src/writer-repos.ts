import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import type {
  WriterArticle,
  WriterArticleStatus,
  WriterComposeJobStatus,
  WriterComposeMeta,
} from "./schemas.js";
import { writerArticleSchema } from "./schemas.js";
import type { WriterArticleMode } from "./schemas.js";
import {
  defaultComposeTitle,
  defaultWriterTitle,
  type WriterLink,
} from "./writer-validation.js";

function writerArticles(db: Db): Collection<WriterArticle> {
  return db.collection<WriterArticle>(COLLECTIONS.writer_articles);
}

export function writerArticleHtmlForLearning(article: WriterArticle): string {
  const html = article.final_html?.trim() || article.generated_html?.trim();
  return html;
}

export async function getWriterArticle(
  db: Db,
  id: string,
  organizationId: string,
): Promise<WriterArticle | null> {
  const doc = await writerArticles(db).findOne({ id, organization_id: organizationId });
  return doc ? writerArticleSchema.parse(doc) : null;
}

export async function listWriterArticlesByOrg(
  db: Db,
  organizationId: string,
): Promise<WriterArticle[]> {
  const docs = await writerArticles(db)
    .find({ organization_id: organizationId })
    .sort({ voice_id: 1, updated_at: -1 })
    .toArray();
  return docs.map((d) => writerArticleSchema.parse(d));
}

export async function listWriterArticlesByOrgAndMode(
  db: Db,
  organizationId: string,
  mode: WriterArticleMode,
): Promise<WriterArticle[]> {
  const docs = await writerArticles(db)
    .find({
      organization_id: organizationId,
      $or: [{ mode }, ...(mode === "rewrite" ? [{ mode: { $exists: false } }] : [])],
    })
    .sort({ voice_id: 1, updated_at: -1 })
    .toArray();
  return docs.map((d) => writerArticleSchema.parse(d));
}

export async function listSavedWriterExamplesForVoice(
  db: Db,
  organizationId: string,
  voiceId: string,
  limit = 5,
): Promise<WriterArticle[]> {
  const docs = await writerArticles(db)
    .find({
      organization_id: organizationId,
      voice_id: voiceId,
      status: "saved",
    })
    .sort({ updated_at: -1 })
    .limit(limit)
    .toArray();
  return docs
    .map((d) => writerArticleSchema.parse(d))
    .filter((a) => writerArticleHtmlForLearning(a).length > 0);
}

export type UpsertWriterArticleDraftInput = {
  id?: string;
  organization_id: string;
  voice_id: string;
  mode?: WriterArticleMode;
  topic?: string;
  reference_urls?: string[];
  source_text: string;
  links: WriterLink[];
  generated_html: string;
  title?: string;
  created_by: string;
};

export async function upsertWriterArticleDraft(
  db: Db,
  data: UpsertWriterArticleDraftInput,
): Promise<WriterArticle> {
  const now = new Date();
  const id = data.id ?? randomUUID();
  const existing = await writerArticles(db).findOne({
    id,
    organization_id: data.organization_id,
  });

  const mode = data.mode ?? existing?.mode ?? "rewrite";
  const defaultTitle =
    mode === "compose" && (data.topic?.trim() || existing?.topic)
      ? defaultComposeTitle(data.topic?.trim() || existing?.topic || "")
      : defaultWriterTitle(data.source_text);

  const row: WriterArticle = writerArticleSchema.parse({
    id,
    organization_id: data.organization_id,
    voice_id: data.voice_id,
    mode,
    topic: data.topic?.trim() || existing?.topic,
    reference_urls: data.reference_urls ?? existing?.reference_urls ?? [],
    title: data.title?.trim() || existing?.title || defaultTitle,
    source_text: data.source_text,
    links: data.links,
    generated_html: data.generated_html,
    final_html: existing?.final_html ?? undefined,
    status: "draft" as WriterArticleStatus,
    created_by: existing?.created_by ?? data.created_by,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  await writerArticles(db).replaceOne({ id: row.id }, row, { upsert: true });
  return row;
}

export type UpsertWriterComposePendingInput = {
  id?: string;
  organization_id: string;
  voice_id: string;
  topic: string;
  reference_urls: string[];
  links: WriterLink[];
  created_by: string;
  preserve_compose_meta?: boolean;
};

export function mergeComposeMeta(
  existing: WriterComposeMeta | undefined,
  next: WriterComposeMeta,
  mode: "full" | "write_only",
): WriterComposeMeta {
  if (mode === "full" || !existing) return next;
  return {
    ...next,
    references_fetched: existing.references_fetched ?? next.references_fetched,
    references_failed: existing.references_failed ?? next.references_failed,
    user_references_fetched:
      existing.user_references_fetched ?? next.user_references_fetched,
    web_references_fetched:
      existing.web_references_fetched ?? next.web_references_fetched,
    web_search_urls: existing.web_search_urls ?? next.web_search_urls,
    research_questions: existing.research_questions ?? next.research_questions,
    research_mode: existing.research_mode ?? next.research_mode,
    source_truncated: existing.source_truncated ?? next.source_truncated,
  };
}

export async function upsertWriterComposePending(
  db: Db,
  data: UpsertWriterComposePendingInput,
): Promise<WriterArticle> {
  const now = new Date();
  const id = data.id ?? randomUUID();
  const existing = await writerArticles(db).findOne({
    id,
    organization_id: data.organization_id,
  });

  const row: WriterArticle = writerArticleSchema.parse({
    id,
    organization_id: data.organization_id,
    voice_id: data.voice_id,
    mode: "compose",
    topic: data.topic.trim(),
    reference_urls: data.reference_urls,
    title:
      existing?.title?.trim() ||
      defaultComposeTitle(data.topic.trim()),
    source_text: existing?.source_text ?? "",
    links: data.links,
    generated_html: existing?.generated_html ?? "",
    final_html: existing?.final_html ?? undefined,
    status: "draft" as WriterArticleStatus,
    compose_status: "pending",
    compose_error: undefined,
    compose_requested_at: now,
    compose_meta: data.preserve_compose_meta ? existing?.compose_meta : undefined,
    created_by: existing?.created_by ?? data.created_by,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  await writerArticles(db).replaceOne({ id: row.id }, row, { upsert: true });
  return row;
}

export type UpdateWriterComposeResultInput = {
  generated_html: string;
  research_brief: string;
  compose_meta: WriterComposeMeta;
};

export async function updateWriterComposeResult(
  db: Db,
  id: string,
  organizationId: string,
  result: UpdateWriterComposeResultInput,
): Promise<WriterArticle | null> {
  const existing = await getWriterArticle(db, id, organizationId);
  if (!existing) return null;

  const now = new Date();
  const row = writerArticleSchema.parse({
    ...existing,
    source_text: result.research_brief,
    generated_html: result.generated_html,
    compose_status: "ready",
    compose_error: undefined,
    compose_meta: result.compose_meta,
    updated_at: now,
  });
  await writerArticles(db).replaceOne({ id, organization_id: organizationId }, row);
  return row;
}

export async function updateWriterComposeFailed(
  db: Db,
  id: string,
  organizationId: string,
  error: string,
): Promise<WriterArticle | null> {
  const existing = await getWriterArticle(db, id, organizationId);
  if (!existing) return null;

  const now = new Date();
  const row = writerArticleSchema.parse({
    ...existing,
    compose_status: "failed",
    compose_error: error.slice(0, 2000),
    updated_at: now,
  });
  await writerArticles(db).replaceOne({ id, organization_id: organizationId }, row);
  return row;
}

export function resolveWriterComposeStatus(article: WriterArticle): WriterComposeJobStatus | undefined {
  if (article.mode !== "compose") return undefined;
  if (article.compose_status) return article.compose_status;
  if (article.generated_html?.trim() || article.source_text?.trim()) return "ready";
  return undefined;
}

export function writerComposeStatusPayload(article: WriterArticle) {
  const composeStatus = resolveWriterComposeStatus(article);
  const meta = article.compose_meta;
  return {
    writer_article_id: article.id,
    compose_status: composeStatus,
    compose_error: article.compose_error,
    compose_requested_at: article.compose_requested_at?.toISOString(),
    generated_html: article.generated_html,
    research_brief: article.source_text,
    references_fetched: meta?.references_fetched,
    references_failed: meta?.references_failed,
    user_references_fetched: meta?.user_references_fetched,
    web_references_fetched: meta?.web_references_fetched,
    web_search_urls: meta?.web_search_urls,
    research_questions: meta?.research_questions,
    research_mode: meta?.research_mode,
    source_truncated: meta?.source_truncated,
    links_requested: meta?.links_requested,
    links_present: meta?.links_present,
    links_carried_from_source: meta?.links_carried_from_source,
    links_added: meta?.links_added,
    links_non_requested_in_output: meta?.links_non_requested_in_output,
    links_appended: meta?.links_appended,
    links_woven: meta?.links_woven,
    links_redistributed: meta?.links_redistributed,
    links_revised: meta?.links_revised,
    facts_extracted: meta?.facts_extracted,
    human_authenticity_score: meta?.human_authenticity_score,
    brand_consistency_score: meta?.brand_consistency_score,
    genericity_score: meta?.genericity_score,
    humanization_attempts: meta?.humanization_attempts,
  };
}

export async function updateWriterArticle(
  db: Db,
  id: string,
  organizationId: string,
  update: {
    title?: string;
    final_html?: string;
    generated_html?: string;
    status?: WriterArticleStatus;
  },
): Promise<WriterArticle | null> {
  const existing = await getWriterArticle(db, id, organizationId);
  if (!existing) return null;

  const now = new Date();
  const set: Partial<WriterArticle> = { updated_at: now };
  if (update.title !== undefined) set.title = update.title.trim() || existing.title;
  if (update.final_html !== undefined) set.final_html = update.final_html;
  if (update.generated_html !== undefined) set.generated_html = update.generated_html;
  if (update.status !== undefined) set.status = update.status;

  const row = writerArticleSchema.parse({ ...existing, ...set });
  await writerArticles(db).replaceOne({ id, organization_id: organizationId }, row);
  return row;
}

export async function deleteWriterArticle(
  db: Db,
  id: string,
  organizationId: string,
): Promise<boolean> {
  const result = await writerArticles(db).deleteOne({ id, organization_id: organizationId });
  return result.deletedCount > 0;
}
