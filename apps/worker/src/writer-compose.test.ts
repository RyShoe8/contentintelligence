import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Db } from "mongodb";
import type { Voice } from "@content-resourcer/db";
import { buildResearchBriefPrompts } from "./writer-compose-research.js";
import { generateArticleComposeHtml } from "./generate-article-compose.js";

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
    keywords: ["content", "ROI"],
    preferred_phrases: [],
    content_signal_ids: [],
    distribution_platforms: [],
    persona: "Direct and practical.",
    persona_status: "ready",
    created_by: "test@example.com",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Voice;
}

describe("buildResearchBriefPrompts", () => {
  it("includes reference excerpts when corpus is provided", () => {
    const { userPrompt, hasReferences } = buildResearchBriefPrompts({
      topic: "Measuring content marketing ROI",
      corpusSections: [{ url: "https://ref.example", text: "Benchmark stats from 2024.", source: "user" }],
    });
    assert.equal(hasReferences, true);
    assert.match(userPrompt, /Reference excerpts \(primary sources\)/);
    assert.match(userPrompt, /Benchmark stats from 2024/);
    assert.doesNotMatch(userPrompt, /Voice keywords/i);
  });

  it("uses cautious general knowledge mode without references", () => {
    const { userPrompt, hasReferences } = buildResearchBriefPrompts({
      topic: "Measuring content marketing ROI",
      corpusSections: [],
    });
    assert.equal(hasReferences, false);
    assert.match(userPrompt, /No reference URLs were fetched/);
    assert.match(userPrompt, /cautious general knowledge/);
  });
});

describe("generateArticleComposeHtml", () => {
  it("rejects voice without ready persona", async () => {
    await assert.rejects(
      () =>
        generateArticleComposeHtml({
          db: {} as Db,
          organizationId: "00000000-0000-4000-8000-000000000020",
          voice: minimalVoice({ persona_status: "pending" }),
          topic: "Topic with enough characters for validation",
          referenceUrls: [],
          links: [],
        }),
      /voice_persona_not_ready/,
    );
  });

  it("rejects write-only compose when research brief is empty", async () => {
    await assert.rejects(
      () =>
        generateArticleComposeHtml({
          db: {} as Db,
          organizationId: "00000000-0000-4000-8000-000000000020",
          voice: minimalVoice(),
          topic: "Topic with enough characters for validation",
          referenceUrls: [],
          links: [],
          skipResearch: true,
          existingResearchBrief: "   ",
        }),
      /research_brief_empty/,
    );
  });
});
