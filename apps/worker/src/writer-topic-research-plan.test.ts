import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTopicResearchPlanPrompts,
  mergeUserSubtopicsIntoPlan,
} from "./writer-topic-research-plan.js";

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

  it("includes user-required subtopics in plan prompts", () => {
    const { userPrompt } = buildTopicResearchPlanPrompts({
      topic: "Content marketing ROI",
      hasUserReferences: true,
      userSubtopics: ["Pricing models", "Attribution models"],
    });

    assert.match(userPrompt, /User-required subtopics/);
    assert.match(userPrompt, /Pricing models/);
    assert.match(userPrompt, /Attribution models/);
  });
});

describe("mergeUserSubtopicsIntoPlan", () => {
  it("prepends user subtopics and dedupes against plan questions", () => {
    const merged = mergeUserSubtopicsIntoPlan(
      {
        research_questions: ["What metrics matter?", "pricing models"],
        angles: [],
        caveats_to_investigate: [],
        search_queries: [],
      },
      ["Pricing models", "Implementation timeline"],
    );

    assert.deepEqual(merged.research_questions, [
      "Pricing models",
      "Implementation timeline",
      "What metrics matter?",
    ]);
  });

  it("caps merged research questions at eight", () => {
    const merged = mergeUserSubtopicsIntoPlan(
      {
        research_questions: ["Question one", "Question two", "Question three", "Question four", "Question five", "Question six"],
        angles: [],
        caveats_to_investigate: [],
        search_queries: [],
      },
      ["Subtopic one", "Subtopic two", "Subtopic three", "Subtopic four"],
    );
    assert.equal(merged.research_questions.length, 8);
    assert.equal(merged.research_questions[0], "Subtopic one");
  });
});
