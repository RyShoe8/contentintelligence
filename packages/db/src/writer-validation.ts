import { z } from "zod";

export const WRITER_LINK_MAX = 5;
export const WRITER_SOURCE_MIN_CHARS = 100;
export const WRITER_SOURCE_MAX_CHARS = 32_000;
export const WRITER_LINK_LABEL_MAX = 80;

const httpsUrl = z
  .string()
  .trim()
  .min(1)
  .refine((s) => z.string().url().safeParse(s).success, { message: "Invalid URL" })
  .refine((s) => s.startsWith("https://"), { message: "URL must use https" });

export const writerLinkSchema = z.object({
  url: httpsUrl,
  label: z.string().trim().max(WRITER_LINK_LABEL_MAX).optional(),
});

export type WriterLink = z.infer<typeof writerLinkSchema>;

export const writerRewriteInputSchema = z.object({
  voice_id: z.string().uuid(),
  source_text: z
    .string()
    .trim()
    .min(WRITER_SOURCE_MIN_CHARS, `Article must be at least ${WRITER_SOURCE_MIN_CHARS} characters`)
    .max(WRITER_SOURCE_MAX_CHARS),
  links: z.array(writerLinkSchema).max(WRITER_LINK_MAX).default([]),
  writer_article_id: z.string().uuid().optional(),
});

export type WriterRewriteInput = z.infer<typeof writerRewriteInputSchema>;

export function parseWriterLinks(raw: unknown): WriterLink[] {
  if (!Array.isArray(raw)) return [];
  const out: WriterLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const url = String((item as { url?: unknown }).url ?? "").trim();
    if (!url) continue;
    const labelRaw = (item as { label?: unknown }).label;
    const label =
      labelRaw != null && String(labelRaw).trim() ? String(labelRaw).trim() : undefined;
    const parsed = writerLinkSchema.safeParse({ url, label });
    if (parsed.success) out.push(parsed.data);
    if (out.length >= WRITER_LINK_MAX) break;
  }
  return out;
}

export function defaultWriterTitle(sourceText: string): string {
  const line = sourceText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "Untitled article";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}
