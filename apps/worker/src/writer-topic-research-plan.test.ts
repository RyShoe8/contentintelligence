import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTopicResearchPlanPrompts } from "./writer-topic-research-plan.js";

describe("buildTopicResearchPlanPrompts", () => {
  it("includes topic and sub-question planning instructions", () => {
    const { systemPrompt, userPrompt } = buildTopicResearchPlanPrompts({
      topic: "Measuring content marketing ROI for B2B teams",
      voiceKeywords: ["content", "ROI"],
      hasUserReferences: true,
    });

    assert.match(systemPrompt, /research_questions/);
    assert.match(systemPrompt, /search_queries/);
    assert.match(systemPrompt, /4-6 focused sub-questions/);
    assert.match(userPrompt, /Measuring content marketing ROI for B2B teams/);
    assert.match(userPrompt, /content, ROI/);
    assert.match(userPrompt, /reference URLs/i);
  });

  it("plans for web discovery when no user references", () => {
    const { userPrompt } = buildTopicResearchPlanPrompts({
      topic: "Edge caching strategies for global SaaS",
      hasUserReferences: false,
    });

    assert.match(userPrompt, /No user reference URLs/);
    assert.match(userPrompt, /search queries should help discover sources/i);
  });
});
