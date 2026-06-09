import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCorpusHash,
  DEFAULT_SOURCE_WEIGHTS,
  formatCorpusForPrompt,
  type WeightedChunk,
} from "./build-brand-content-corpus.js";

describe("buildBrandContentCorpus helpers", () => {
  it("assigns default weights by source type", () => {
    assert.equal(DEFAULT_SOURCE_WEIGHTS.replies, 1.3);
    assert.equal(DEFAULT_SOURCE_WEIGHTS.socialPosts, 1.2);
    assert.equal(DEFAULT_SOURCE_WEIGHTS.landingPages, 0.4);
  });

  it("sorts higher-weight chunks first in prompt text", () => {
    const chunks: WeightedChunk[] = [
      { type: "landingPages", weight: 0.4, label: "site", text: "corporate copy" },
      { type: "replies", weight: 1.3, label: "reply", text: "insider reply text" },
    ];
    const prompt = formatCorpusForPrompt(chunks, 5000);
    assert.ok(prompt.indexOf("replies") < prompt.indexOf("landingPages"));
  });

  it("produces stable corpus hash for same inputs", () => {
    const voice = {
      website_url: "https://example.com",
      rss_feed_url: "",
      social_links: [],
      keywords: ["urgent"],
    } as const;
    const chunks: WeightedChunk[] = [
      { type: "socialPosts", weight: 1, label: "x", text: "hello" },
    ];
    const a = computeCorpusHash(chunks, voice as never);
    const b = computeCorpusHash(chunks, voice as never);
    assert.equal(a, b);
  });

  it("does not include content_signal_ids in corpus hash", () => {
    const chunks: WeightedChunk[] = [
      { type: "landingPages", weight: 0.4, label: "site", text: "copy" },
    ];
    const baseVoice = {
      website_url: "https://example.com",
      rss_feed_url: "",
      social_links: [],
      keywords: ["playful"],
    };
    const withSignals = {
      ...baseVoice,
      content_signal_ids: ["00000000-0000-4000-8000-000000000001"],
    };
    const hashA = computeCorpusHash(chunks, baseVoice as never);
    const hashB = computeCorpusHash(chunks, withSignals as never);
    assert.equal(hashA, hashB);
  });

  it("includes style example keys in corpus hash", () => {
    const voice = {
      website_url: "",
      rss_feed_url: "",
      social_links: [],
      keywords: [],
    } as const;
    const chunks: WeightedChunk[] = [
      { type: "blogs", weight: 0.8, label: "Style example: Post", text: "body" },
    ];
    const without = computeCorpusHash(chunks, voice as never);
    const withExamples = computeCorpusHash(chunks, voice as never, [
      "id:https://example.com/post:2026-01-01T00:00:00.000Z",
    ]);
    assert.notEqual(without, withExamples);
  });
});
