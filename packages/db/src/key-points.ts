import { z } from "zod";

export const KEY_POINT_CATEGORIES = [
  "deadline",
  "eligibility",
  "offer",
  "requirement",
  "terms",
  "other",
] as const;

export const keyPointCategorySchema = z.enum(KEY_POINT_CATEGORIES);

export type KeyPointCategory = z.infer<typeof keyPointCategorySchema>;

export const keyPointSchema = z.object({
  category: keyPointCategorySchema.default("other"),
  text: z.string().max(500),
});

export type KeyPoint = z.infer<typeof keyPointSchema>;

const MAX_KEY_POINTS = 16;

const CATEGORY_SET = new Set<string>(KEY_POINT_CATEGORIES);

export function normalizeKeyPointCategory(raw: unknown): KeyPointCategory {
  if (typeof raw === "string" && CATEGORY_SET.has(raw)) {
    return raw as KeyPointCategory;
  }
  return "other";
}

/** Split compound legacy bullets into atomic lines. */
export function splitCompoundKeyPointText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts: string[] = [];
  const lines = trimmed.split(/\n+/);
  for (const line of lines) {
    const chunks = line
      .split(/\s*;\s*|\s*•\s*|\s*\|\s*/)
      .flatMap((chunk) => {
        const numbered = chunk.split(/\s*(?=\d{1,2}[.)]\s+)/);
        return numbered.length > 1 ? numbered : [chunk];
      });
    for (let chunk of chunks) {
      chunk = chunk.replace(/^\d{1,2}[.)]\s*/, "").replace(/^[-*]\s+/, "").trim();
      if (chunk.length >= 8) parts.push(chunk);
    }
  }

  if (parts.length === 0 && trimmed.length >= 8) return [trimmed];
  return parts;
}

function dedupeKeyPoints(points: KeyPoint[]): KeyPoint[] {
  const seen = new Set<string>();
  const out: KeyPoint[] = [];
  for (const p of points) {
    const key = `${p.category}:${p.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= MAX_KEY_POINTS) break;
  }
  return out;
}

/** Expand compound text entries into multiple atomic key points. */
export function expandKeyPoints(points: KeyPoint[]): KeyPoint[] {
  const expanded: KeyPoint[] = [];
  for (const p of points) {
    const splits = splitCompoundKeyPointText(p.text);
    if (splits.length <= 1) {
      expanded.push(p);
      continue;
    }
    for (const text of splits) {
      expanded.push({ category: p.category, text: text.slice(0, 500) });
    }
  }
  return dedupeKeyPoints(expanded);
}

/** Parse Mongo / legacy shapes into normalized KeyPoint[]. */
export function normalizeKeyPointsFromRaw(val: unknown): KeyPoint[] {
  if (!Array.isArray(val)) return [];

  const raw: KeyPoint[] = [];
  for (const x of val) {
    if (typeof x === "string") {
      const s = x.trim();
      if (!s) continue;
      raw.push({ category: "other", text: s.slice(0, 500) });
      continue;
    }
    if (x && typeof x === "object" && "text" in x) {
      const o = x as { category?: unknown; text?: unknown };
      const text = typeof o.text === "string" ? o.text.trim().slice(0, 500) : "";
      if (!text) continue;
      raw.push({
        category: normalizeKeyPointCategory(o.category),
        text,
      });
    }
  }

  return expandKeyPoints(raw);
}

export const keyPointsFieldSchema = z.preprocess(
  (val) => normalizeKeyPointsFromRaw(val),
  z.array(keyPointSchema).max(MAX_KEY_POINTS).default([]),
);

export const KEY_POINT_CATEGORY_LABELS: Record<KeyPointCategory, string> = {
  deadline: "Deadline",
  eligibility: "Eligibility",
  offer: "Offer",
  requirement: "Requirement",
  terms: "Terms",
  other: "Other",
};
