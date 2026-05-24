import type { Db } from "mongodb";
import { mergeVoiceBrandMemory } from "@content-resourcer/db";
import { env } from "../env.js";

const QUOTED_PHRASE = /["“]([^"”]{4,60})["”]/g;

function uniquePush(list: string[], item: string, max: number): string[] {
  const s = item.trim();
  if (!s) return list;
  const key = s.toLowerCase();
  if (list.some((x) => x.toLowerCase() === key)) return list;
  return [...list, s].slice(-max);
}

export function extractMemoryFromCopy(socialCopy: string): {
  favoritePhrases: string[];
  recurringCTAs: string[];
} {
  const favoritePhrases: string[] = [];
  const recurringCTAs: string[] = [];

  for (const match of socialCopy.matchAll(QUOTED_PHRASE)) {
    const phrase = match[1]?.trim();
    if (phrase) favoritePhrases.push(phrase);
  }

  const lines = socialCopy.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (last && last.length < 80 && /[!?.]$/.test(last)) {
    recurringCTAs.push(last);
  }

  return { favoritePhrases, recurringCTAs };
}

export async function updateBrandMemoryFromCopies(
  db: Db,
  voiceId: string,
  copies: string[],
): Promise<void> {
  if (!copies.length) return;

  const favoritePhrases: string[] = [];
  const recurringCTAs: string[] = [];

  for (const copy of copies) {
    const extracted = extractMemoryFromCopy(copy);
    for (const p of extracted.favoritePhrases) {
      if (favoritePhrases.length < env.brandMemoryMaxItems) favoritePhrases.push(p);
    }
    for (const c of extracted.recurringCTAs) {
      if (recurringCTAs.length < env.brandMemoryMaxItems) recurringCTAs.push(c);
    }
  }

  if (!favoritePhrases.length && !recurringCTAs.length) return;

  await mergeVoiceBrandMemory(db, voiceId, {
    favoritePhrases,
    recurringCTAs,
  });
}
