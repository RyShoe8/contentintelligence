import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReferenceCorpus,
  buildReferenceCorpusPrioritized,
  formatReferenceCorpusForPrompt,
  REFERENCE_CHARS_PER_URL,
  REFERENCE_CORPUS_MAX_CHARS,
} from "./writer-reference-corpus.js";

async function mockFetch(url: string): Promise<string | null> {
  if (url.includes("fail.example")) return null;
  if (url.includes("empty.example")) return "<html><body></body></html>";
  return `<html><body><p>Reference content for ${url}. ${"word ".repeat(5000)}</p></body></html>`;
}

describe("buildReferenceCorpus", () => {
  it("fetches and strips html from valid urls", async () => {
    const result = await buildReferenceCorpus(["https://good.example/page"], mockFetch);
    assert.equal(result.fetched, 1);
    assert.equal(result.failed.length, 0);
    assert.match(result.sections[0]?.text ?? "", /Reference content for https:\/\/good\.example\/page/);
    assert.equal(result.sections[0]?.source, "user");
  });

  it("skips failed urls without aborting", async () => {
    const result = await buildReferenceCorpus(
      ["https://good.example/a", "https://fail.example/b", "https://empty.example/c"],
      mockFetch,
    );
    assert.equal(result.fetched, 1);
    assert.deepEqual(result.failed, ["https://fail.example/b", "https://empty.example/c"]);
  });

  it("deduplicates urls", async () => {
    const result = await buildReferenceCorpus(
      ["https://good.example/a", "https://good.example/a"],
      mockFetch,
    );
    assert.equal(result.fetched, 1);
  });

  it("caps per-url and total corpus size", async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://good.example/page-${i}`);
    const result = await buildReferenceCorpus(urls, mockFetch);
    assert.ok(result.fetched >= 1);
    const totalChars = result.sections.reduce((sum, s) => sum + s.text.length, 0);
    assert.ok(totalChars <= REFERENCE_CORPUS_MAX_CHARS + 100);
    for (const section of result.sections) {
      assert.ok(section.text.length <= REFERENCE_CHARS_PER_URL + 50);
    }
  });
});

describe("buildReferenceCorpusPrioritized", () => {
  it("fetches user urls before web urls and labels sources", async () => {
    const fetchOrder: string[] = [];
    async function trackingFetch(url: string): Promise<string | null> {
      fetchOrder.push(url);
      return mockFetch(url);
    }

    const result = await buildReferenceCorpusPrioritized(
      {
        userUrls: ["https://user.example/a"],
        webUrls: ["https://web.example/b"],
      },
      trackingFetch,
    );

    assert.equal(result.userFetched, 1);
    assert.equal(result.webFetched, 1);
    assert.equal(result.sections[0]?.source, "user");
    assert.equal(result.sections[1]?.source, "web");
    assert.deepEqual(fetchOrder, ["https://user.example/a", "https://web.example/b"]);
  });

  it("dedupes web urls that overlap user urls", async () => {
    const result = await buildReferenceCorpusPrioritized(
      {
        userUrls: ["https://good.example/shared"],
        webUrls: ["https://good.example/shared", "https://web-only.example/page"],
      },
      mockFetch,
    );
    assert.equal(result.fetched, 2);
    assert.equal(result.userFetched, 1);
    assert.equal(result.webFetched, 1);
  });
});

describe("formatReferenceCorpusForPrompt", () => {
  it("formats sections with url headers", () => {
    const text = formatReferenceCorpusForPrompt([
      { url: "https://a.example", text: "Alpha facts.", source: "user" },
      { url: "https://b.example", text: "Beta facts.", source: "web" },
    ]);
    assert.match(text, /User reference 1: https:\/\/a\.example/);
    assert.match(text, /Alpha facts\./);
    assert.match(text, /Web source 2: https:\/\/b\.example/);
  });

  it("returns placeholder when empty", () => {
    assert.match(formatReferenceCorpusForPrompt([]), /No reference pages fetched/);
  });
});
