import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDeepResearchConsolidationPrompts,
  buildDeepResearchSectionPrompts,
  buildResearchBriefPrompts,
} from "./writer-compose-research.js";

describe("buildDeepResearchSectionPrompts", () => {
  it("includes batched questions and labeled source excerpts", () => {
    const { userPrompt } = buildDeepResearchSectionPrompts({
      topic: "Measuring content marketing ROI",
      questions: ["What metrics matter?", "What tools exist?"],
      corpusSections: [
        { url: "https://ref.example", text: "Benchmark stats.", source: "user" },
        { url: "https://web.example", text: "Industry report.", source: "web" },
      ],
      hasUserReferences: true,
    });

    assert.match(userPrompt, /1\. What metrics matter\?/);
    assert.match(userPrompt, /2\. What tools exist\?/);
    assert.match(userPrompt, /User reference 1: https:\/\/ref\.example/);
    assert.match(userPrompt, /Web source 2: https:\/\/web\.example/);
  });
});

describe("buildDeepResearchConsolidationPrompts", () => {
  it("merges plan angles and section notes into consolidation brief", () => {
    const { systemPrompt, userPrompt } = buildDeepResearchConsolidationPrompts({
      topic: "Measuring content marketing ROI",
      plan: {
        research_questions: ["Q1"],
        angles: ["Practical ROI frameworks"],
        caveats_to_investigate: ["Attribution is hard"],
        search_queries: ["content ROI"],
      },
      sectionNotes: "Q1 notes with https://ref.example citation.",
    });

    assert.match(systemPrompt, /800–1,200 words of briefing content/);
    assert.match(userPrompt, /Practical ROI frameworks/);
    assert.match(userPrompt, /Attribution is hard/);
    assert.match(userPrompt, /Q1 notes with https:\/\/ref\.example citation/);
  });

  it("omits FAQ from deep consolidation when includeFaq is false", () => {
    const { systemPrompt } = buildDeepResearchConsolidationPrompts({
      topic: "Measuring content marketing ROI",
      plan: {
        research_questions: ["Q1"],
        angles: ["Practical ROI frameworks"],
        caveats_to_investigate: ["Attribution is hard"],
        search_queries: ["content ROI"],
      },
      sectionNotes: "Notes",
      includeFaq: false,
    });
    assert.match(systemPrompt, /Do not include FAQ or Q&A content/);
    assert.doesNotMatch(systemPrompt, /, FAQ,/);
  });
});

describe("buildResearchBriefPrompts with source labels", () => {
  it("labels user and web references in standard brief mode", () => {
    const { userPrompt, hasReferences } = buildResearchBriefPrompts({
      topic: "Topic here with enough context",
      corpusSections: [
        { url: "https://user.example", text: "User facts.", source: "user" },
      ],
    });
    assert.equal(hasReferences, true);
    assert.match(userPrompt, /User reference 1: https:\/\/user\.example/);
  });

  it("includes article depth guidance and required subtopics", () => {
    const { systemPrompt, userPrompt } = buildResearchBriefPrompts({
      topic: "Topic here with enough context",
      corpusSections: [],
      articleDepth: 85,
      subtopics: ["Pricing models", "ROI frameworks"],
    });

    assert.match(systemPrompt, /1,800–2,500 words of briefing content/);
    assert.match(userPrompt, /Required subtopics to cover in the brief/);
    assert.match(userPrompt, /Pricing models/);
    assert.match(userPrompt, /ROI frameworks/);
  });

  it("omits FAQ from standard brief prompts when includeFaq is false", () => {
    const { systemPrompt } = buildResearchBriefPrompts({
      topic: "Topic here with enough context",
      corpusSections: [],
      includeFaq: false,
    });
    assert.match(systemPrompt, /Do not include FAQ or Q&A content/);
    assert.doesNotMatch(systemPrompt, /Include a labeled FAQ section/);
  });

  it("requires FAQ Q/A pairs when includeFaq is true", () => {
    const { systemPrompt } = buildResearchBriefPrompts({
      topic: "Topic here with enough context",
      corpusSections: [],
      articleDepth: 50,
      includeFaq: true,
    });
    assert.match(systemPrompt, /Include a labeled FAQ section with 4–6 question-and-answer pairs/);
  });

  it("uses how-to brief sections without angles when articleType is how_to", () => {
    const { systemPrompt } = buildResearchBriefPrompts({
      topic: "How to setup your email signature in Apple Mail",
      corpusSections: [],
      articleType: "how_to",
    });
    assert.match(systemPrompt, /Setup steps, Per-platform\/subtopic procedures, Troubleshooting, Caveats/);
    assert.doesNotMatch(systemPrompt, /Angles to cover/);
    assert.match(systemPrompt, /how-to tutorial/);
  });
});

describe("buildDeepResearchSectionPrompts citations", () => {
  it("requires minimum inline citations at in-depth depth", () => {
    const { systemPrompt } = buildDeepResearchSectionPrompts({
      topic: "Tax implications of online casino winnings",
      questions: ["What are federal reporting rules?"],
      corpusSections: [{ url: "https://ref.example", text: "IRS rules.", source: "user" }],
      hasUserReferences: true,
      minCitationsPerSection: 2,
    });

    assert.match(systemPrompt, /at least 2 inline source URL citation/);
    assert.match(systemPrompt, /Mark weak or uncertain claims explicitly/);
  });
});
