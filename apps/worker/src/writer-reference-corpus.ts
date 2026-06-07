import { convert } from "html-to-text";
import { fetchSafeText } from "./safe-fetch.js";

export const REFERENCE_CHARS_PER_URL = 12_000;
export const REFERENCE_CORPUS_MAX_CHARS = 40_000;

export type ReferenceCorpusSource = "user" | "web";

export type ReferenceCorpusSection = {
  url: string;
  text: string;
  source: ReferenceCorpusSource;
};

export type ReferenceCorpusResult = {
  sections: ReferenceCorpusSection[];
  fetched: number;
  failed: string[];
  userFetched: number;
  webFetched: number;
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

async function fetchUrlSection(
  url: string,
  source: ReferenceCorpusSource,
  fetchText: (url: string) => Promise<string | null>,
  perUrlBudget: number,
): Promise<{ section: ReferenceCorpusSection | null; failed: boolean }> {
  const html = await fetchText(url);
  if (!html) return { section: null, failed: true };

  const text = capText(stripHtmlToText(html), perUrlBudget);
  if (!text) return { section: null, failed: true };

  return { section: { url, text, source }, failed: false };
}

export async function buildReferenceCorpus(
  urls: string[],
  fetchText: (url: string) => Promise<string | null> = fetchSafeText,
): Promise<ReferenceCorpusResult> {
  const result = await buildReferenceCorpusPrioritized(
    { userUrls: urls, webUrls: [] },
    fetchText,
  );
  return result;
}

export async function buildReferenceCorpusPrioritized(
  opts: { userUrls: string[]; webUrls: string[] },
  fetchText: (url: string) => Promise<string | null> = fetchSafeText,
): Promise<ReferenceCorpusResult> {
  const userUnique = [...new Set(opts.userUrls.map((u) => u.trim()).filter(Boolean))];
  const webUnique = [...new Set(opts.webUrls.map((u) => u.trim()).filter(Boolean))].filter(
    (u) => !userUnique.includes(u),
  );

  const sections: ReferenceCorpusSection[] = [];
  const failed: string[] = [];
  let totalChars = 0;
  let userFetched = 0;
  let webFetched = 0;

  async function addUrls(urls: string[], source: ReferenceCorpusSource) {
    for (const url of urls) {
      if (totalChars >= REFERENCE_CORPUS_MAX_CHARS) break;

      const perUrlBudget = Math.min(
        REFERENCE_CHARS_PER_URL,
        REFERENCE_CORPUS_MAX_CHARS - totalChars,
      );
      const { section, failed: fetchFailed } = await fetchUrlSection(
        url,
        source,
        fetchText,
        perUrlBudget,
      );
      if (fetchFailed || !section) {
        failed.push(url);
        continue;
      }

      sections.push(section);
      totalChars += section.text.length;
      if (source === "user") userFetched++;
      else webFetched++;
    }
  }

  await addUrls(userUnique, "user");
  await addUrls(webUnique, "web");

  return {
    sections,
    fetched: sections.length,
    failed,
    userFetched,
    webFetched,
  };
}

export function formatReferenceCorpusForPrompt(sections: ReferenceCorpusSection[]): string {
  if (!sections.length) return "(No reference pages fetched.)";
  return sections
    .map((s, i) => {
      const label = s.source === "user" ? "User reference" : "Web source";
      return `### ${label} ${i + 1}: ${s.url}\n${s.text}`;
    })
    .join("\n\n");
}
