import type { Collection, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "./collections.js";
import type { WriterArticle, WriterArticleStatus } from "./schemas.js";
import { writerArticleSchema } from "./schemas.js";
import { defaultWriterTitle, type WriterLink } from "./writer-validation.js";

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

  const row: WriterArticle = writerArticleSchema.parse({
    id,
    organization_id: data.organization_id,
    voice_id: data.voice_id,
    title: data.title?.trim() || existing?.title || defaultWriterTitle(data.source_text),
    source_text: data.source_text,
    links: data.links,
    generated_html: data.generated_html,
    final_html: existing?.final_html,
    status: "draft" as WriterArticleStatus,
    created_by: existing?.created_by ?? data.created_by,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  await writerArticles(db).replaceOne({ id: row.id }, row, { upsert: true });
  return row;
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
