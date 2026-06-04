import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

describe("buildArticleRewritePrompts", () => {
  it("includes provided links and saved examples in user prompt", () => {
    const { systemPrompt, userPrompt } = buildArticleRewritePrompts({
      voice: minimalVoice(),
      sourceText: "A".repeat(200),
      links: [
        { url: "https://casino.example/deal", label: "Claim offer" },
        { url: "https://blog.example/review" },
      ],
      examples: [
        {
          title: "Prior post",
          html: "<p>Example saved article with <a href=\"https://old.example\">link</a>.</p>",
        },
      ],
    });

    assert.match(systemPrompt, /HTML fragment/i);
    assert.match(userPrompt, /https:\/\/casino\.example\/deal/);
    assert.match(userPrompt, /Claim offer/);
    assert.match(userPrompt, /https:\/\/blog\.example\/review/);
    assert.match(userPrompt, /contextually appropriate places/i);
    assert.match(userPrompt, /not clustered at the end/i);
    assert.match(systemPrompt, /Do NOT put all links in the final paragraph/i);
    assert.match(userPrompt, /Published examples in this voice/);
    assert.match(userPrompt, /Prior post/);
  });

  it("embeds persona in system prompt", () => {
    const { systemPrompt } = buildArticleRewritePrompts({
      voice: minimalVoice(),
      sourceText: "Source article body here with enough text for testing purposes only.",
      links: [],
      examples: [],
    });

    assert.match(systemPrompt, /Brand voice persona/i);
    assert.match(systemPrompt, /skeptical of hype/i);
  });
});
