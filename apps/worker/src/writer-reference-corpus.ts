import { convert } from "html-to-text";
import { fetchSafeText } from "./safe-fetch.js";

export const REFERENCE_CHARS_PER_URL = 12_000;
export const REFERENCE_CORPUS_MAX_CHARS = 40_000;

export type ReferenceCorpusSection = {
  url: string;
  text: string;
};

export type ReferenceCorpusResult = {
  sections: ReferenceCorpusSection[];
  fetched: number;
  failed: string[];
};

function stripHtmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [{ selector: "a", options: { ignoreHref: true } }],
  }).trim();
}

function capText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n[Truncated for length.]`;
}

export async function buildReferenceCorpus(
  urls: string[],
  fetchText: (url: string) => Promise<string | null> = fetchSafeText,
): Promise<ReferenceCorpusResult> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const sections: ReferenceCorpusSection[] = [];
  const failed: string[] = [];
  let totalChars = 0;

  for (const url of unique) {
    if (totalChars >= REFERENCE_CORPUS_MAX_CHARS) break;

    const html = await fetchText(url);
    if (!html) {
      failed.push(url);
      continue;
    }

    const perUrlBudget = Math.min(
      REFERENCE_CHARS_PER_URL,
      REFERENCE_CORPUS_MAX_CHARS - totalChars,
    );
    const text = capText(stripHtmlToText(html), perUrlBudget);
    if (!text) {
      failed.push(url);
      continue;
    }

    sections.push({ url, text });
    totalChars += text.length;
  }

  return { sections, fetched: sections.length, failed };
}

export function formatReferenceCorpusForPrompt(sections: ReferenceCorpusSection[]): string {
  if (!sections.length) return "(No reference pages fetched.)";
  return sections
    .map(
      (s, i) =>
        `### Reference ${i + 1}: ${s.url}\n${s.text}`,
    )
    .join("\n\n");
}
