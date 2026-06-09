import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentFactsSchema } from "@content-resourcer/db";
import {
  buildExpandArticleComposeSystemPrompt,
  buildExpandArticleComposeUserPrompt,
} from "./writer-compose-expand.js";

describe("buildExpandArticleComposeSystemPrompt", () => {
  it("includes compose voice rules and forbidden patterns", () => {
    const prompt = buildExpandArticleComposeSystemPrompt({
      minWords: 1200,
      maxWords: 1600,
      topic: "Senior living design",
      includeFaq: true,
    });
    assert.match(prompt, /Short paragraphs \(often 1–3 sentences\)/);
    assert.match(prompt, /Innovative Design Trends/);
    assert.match(prompt, /NOT "Your Questions Answered"/);
  });
});

describe("buildExpandArticleComposeUserPrompt", () => {
  it("uses facts JSON instead of research brief", () => {
    const facts = contentFactsSchema.parse({
      contentType: "hybrid",
      narrativeSections: [{ title: "Key facts", points: ["Open floor plans matter."] }],
      keyDetails: ["Wide doorways help mobility."],
    });
    const userPrompt = buildExpandArticleComposeUserPrompt({
      facts,
      links: [],
      minWords: 1200,
      maxWords: 1600,
      currentHtml: "<p>Seed paragraph.</p>",
    });
    assert.match(userPrompt, /Extracted facts \(JSON/);
    assert.match(userPrompt, /Open floor plans matter/);
    assert.doesNotMatch(userPrompt, /Research brief \(source of facts\)/);
  });
});
