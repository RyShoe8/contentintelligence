import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env } from "./env.js";
import {
  mergeDiscoveredUrls,
  resolveWebSearchLimits,
  searchWebForTopic,
  isWebSearchConfigured,
} from "./writer-web-search.js";

describe("mergeDiscoveredUrls", () => {
  it("dedupes, filters to https, and excludes user urls", () => {
    const urls = mergeDiscoveredUrls(
      [
        "https://a.example/page",
        "http://insecure.example",
        "https://a.example/page",
        "https://b.example",
        "not-a-url",
      ],
      ["https://b.example"],
      5,
    );
    assert.deepEqual(urls, ["https://a.example/page"]);
  });

  it("caps at maxResults", () => {
    const urls = mergeDiscoveredUrls(
      ["https://1.example", "https://2.example", "https://3.example"],
      [],
      2,
    );
    assert.equal(urls.length, 2);
  });
});

describe("resolveWebSearchLimits", () => {
  it("uses request values when below env ceiling", () => {
    const savedQueries = env.writerWebSearchMaxQueries;
    const savedResults = env.writerWebSearchMaxResults;
    env.writerWebSearchMaxQueries = 10;
    env.writerWebSearchMaxResults = 15;
    try {
      assert.deepEqual(resolveWebSearchLimits({ maxQueries: 2, maxResults: 4 }), {
        maxQueries: 2,
        maxResults: 4,
      });
    } finally {
      env.writerWebSearchMaxQueries = savedQueries;
      env.writerWebSearchMaxResults = savedResults;
    }
  });

  it("clamps request values to env ceiling", () => {
    const savedQueries = env.writerWebSearchMaxQueries;
    const savedResults = env.writerWebSearchMaxResults;
    env.writerWebSearchMaxQueries = 2;
    env.writerWebSearchMaxResults = 3;
    try {
      assert.deepEqual(resolveWebSearchLimits({ maxQueries: 8, maxResults: 12 }), {
        maxQueries: 2,
        maxResults: 3,
      });
    } finally {
      env.writerWebSearchMaxQueries = savedQueries;
      env.writerWebSearchMaxResults = savedResults;
    }
  });
});

describe("searchWebForTopic", () => {
  it("returns empty when Tavily key is not configured", async () => {
    const saved = env.tavilyApiKey;
    env.tavilyApiKey = "";
    try {
      const result = await searchWebForTopic(["content marketing ROI"]);
      assert.deepEqual(result.urls, []);
      assert.equal(result.snippets.size, 0);
    } finally {
      env.tavilyApiKey = saved;
    }
  });

  it("respects request limits below env ceiling", async () => {
    const savedKey = env.tavilyApiKey;
    const savedMaxQueries = env.writerWebSearchMaxQueries;
    const savedMaxResults = env.writerWebSearchMaxResults;
    env.tavilyApiKey = "test-key";
    env.writerWebSearchMaxQueries = 10;
    env.writerWebSearchMaxResults = 15;
    let fetchCount = 0;

    try {
      const result = await searchWebForTopic(
        ["q1", "q2", "q3", "q4"],
        [],
        async () => {
          fetchCount++;
          return new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
        { maxQueries: 2, maxResults: 1 },
      );

      assert.equal(fetchCount, 2);
      assert.deepEqual(result.urls, []);
    } finally {
      env.tavilyApiKey = savedKey;
      env.writerWebSearchMaxQueries = savedMaxQueries;
      env.writerWebSearchMaxResults = savedMaxResults;
    }
  });

  it("calls Tavily and merges discovered urls", async () => {
    const savedKey = env.tavilyApiKey;
    const savedMax = env.writerWebSearchMaxResults;
    env.tavilyApiKey = "test-key";
    env.writerWebSearchMaxResults = 5;

    try {
      const result = await searchWebForTopic(
        ["content marketing ROI"],
        ["https://user.example/existing"],
        async (url, init) => {
          assert.equal(url, "https://api.tavily.com/search");
          assert.equal((init as RequestInit).method, "POST");
          const body = JSON.parse(String((init as RequestInit).body)) as {
            api_key: string;
            query: string;
          };
          assert.equal(body.api_key, "test-key");
          assert.equal(body.query, "content marketing ROI");

          return new Response(
            JSON.stringify({
              results: [
                { url: "https://found.example/guide", content: "ROI benchmarks." },
                { url: "https://user.example/existing", content: "dup" },
                { url: "http://bad.example", content: "skip" },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      );

      assert.deepEqual(result.urls, ["https://found.example/guide"]);
      assert.equal(result.snippets.get("https://found.example/guide"), "ROI benchmarks.");
    } finally {
      env.tavilyApiKey = savedKey;
      env.writerWebSearchMaxResults = savedMax;
    }
  });
});

describe("isWebSearchConfigured", () => {
  it("reflects Tavily key presence", () => {
    const saved = env.tavilyApiKey;
    env.tavilyApiKey = "key";
    assert.equal(isWebSearchConfigured(), true);
    env.tavilyApiKey = "";
    assert.equal(isWebSearchConfigured(), false);
    env.tavilyApiKey = saved;
  });
});
