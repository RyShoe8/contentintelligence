import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceSchema } from "./schemas.js";
import { formatStyleExamplesSyncSummary } from "./voice-repos.js";

describe("voiceSchema", () => {
  it("caps keywords at five", () => {
    const parsed = voiceSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: "22222222-2222-2222-2222-222222222222",
      name: "Brand",
      keywords: ["a", "b", "c", "d", "e", "f", "g"],
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.keywords.length, 5);
    assert.deepEqual(parsed.keywords, ["a", "b", "c", "d", "e"]);
  });

  it("allows empty https URLs", () => {
    const parsed = voiceSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: "22222222-2222-2222-2222-222222222222",
      name: "Brand",
      website_url: "",
      rss_feed_url: "",
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.website_url, "");
    assert.equal(parsed.rss_feed_url, "");
  });

  it("parses sources_in_posts_level with default zero", () => {
    const parsed = voiceSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: "22222222-2222-2222-2222-222222222222",
      name: "Brand",
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.sources_in_posts_level, 0);
  });

  it("parses sources_in_posts_level when set", () => {
    const parsed = voiceSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: "22222222-2222-2222-2222-222222222222",
      name: "Brand",
      sources_in_posts_level: 60,
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.sources_in_posts_level, 60);
  });

  it("accepts null persona_error from Mongo-shaped docs", () => {
    const parsed = voiceSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: "22222222-2222-2222-2222-222222222222",
      name: "Brand",
      persona_error: null,
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.persona_error, undefined);
  });
});

describe("formatStyleExamplesSyncSummary", () => {
  it("formats basic counts", () => {
    const summary = formatStyleExamplesSyncSummary({
      ingested: 3,
      updated: 1,
      skipped: 2,
      failed: 0,
    });
    assert.equal(summary, "3 imported, 1 updated, 2 skipped, 0 failed");
  });

  it("includes skip reason detail when items were skipped", () => {
    const summary = formatStyleExamplesSyncSummary({
      ingested: 0,
      updated: 0,
      skipped: 4,
      failed: 0,
      skip_reasons: { no_body: 2, excluded: 1, invalid_url: 1 },
    });
    assert.match(summary, /4 skipped/);
    assert.match(summary, /2 no body/);
    assert.match(summary, /1 excluded/);
    assert.match(summary, /1 invalid URL/);
  });

  it("notes feed fetch failure", () => {
    const summary = formatStyleExamplesSyncSummary({
      ingested: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      feed_fetch_failed: true,
    });
    assert.match(summary, /feed fetch failed/);
  });
});
