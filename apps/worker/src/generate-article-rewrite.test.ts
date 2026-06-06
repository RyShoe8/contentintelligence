import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Db } from "mongodb";
import type { Voice } from "@content-resourcer/db";
import { buildArticleRewritePrompts } from "./generate-article-rewrite.js";

function minimalVoice(overrides: Partial<Voice> = {}): Voice {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    organization_id: "00000000-0000-4000-8000-000000000020",
    name: "Test Voice",
    brand_mention_level: 50,
    sources_in_posts_level: 0,
    website_url: "",
    rss_feed_url: "",
    social_links: [],
    keywords: [],
    preferred_phrases: [],
    content_signal_ids: [],
    distribution_platforms: [],
    persona: "Witty, direct, skeptical of hype.",
    persona_status: "ready",
    created_by: "test@example.com",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Voice;
}

const stubDb = {} as Db;

describe("buildArticleRewritePrompts", () => {
  it("builds facts-only reconstruction system prompt with persona and links", () => {
    const { systemPrompt, userPrompt } = buildArticleRewritePrompts({
      db: stubDb,
      organizationId: "00000000-0000-4000-8000-000000000020",
      voice: minimalVoice(),
      sourceText: "A".repeat(200),
      links: [
        { url: "https://casino.example/deal", label: "Claim offer" },
        { url: "https://blog.example/review" },
      ],
    });

    assert.match(systemPrompt, /HTML fragment/i);
    assert.match(systemPrompt, /Do NOT rewrite any original draft text/i);
    assert.match(systemPrompt, /skeptical of hype/i);
    assert.match(systemPrompt, /act now/i);
    assert.match(userPrompt, /Facts-only reconstruction/i);
  });

  it("does not include source article text in user prompt", () => {
    const source = "Unique source phrase xyz123 for rewrite testing only here.";
    const { userPrompt } = buildArticleRewritePrompts({
      db: stubDb,
      organizationId: "00000000-0000-4000-8000-000000000020",
      voice: minimalVoice(),
      sourceText: source,
      links: [],
    });

    assert.doesNotMatch(userPrompt, /Unique source phrase xyz123/);
  });
});
