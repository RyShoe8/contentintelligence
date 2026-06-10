import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_COMPOSE_ARTICLE_ARCHETYPE } from "./compose-article-archetype.js";
import {
  extractStyleExampleHeadings,
  formatComposeOutlineForPrompt,
  planComposeOutline,
} from "./compose-outline.js";

describe("extractStyleExampleHeadings", () => {
  it("returns primary archetype headings instead of blending all examples", () => {
    const headings = extractStyleExampleHeadings([
      {
        title: "Thin",
        html: "<h2>Thin heading</h2><p>Body</p>",
      },
      {
        title: "Rich",
        html: "<h2>We start with chairs</h2><p>Body</p><h2>What we look for</h2>",
        composeStyleKit: {
          headings: ["We start with chairs", "What we look for", "What we reject"],
          openingParagraphs: ["We never specify seating we have not tested ourselves."],
          signatureParagraphs: ["We never specify seating we have not tested ourselves."],
        },
      },
    ]);

    assert.deepEqual(headings, ["We start with chairs", "What we look for", "What we reject"]);
    assert.ok(!headings.includes("Thin heading"));
  });
});

describe("planComposeOutline", () => {
  it("fallback outline matches archetype section count and avoids subtopic headings", async () => {
    const subtopics = ["Active adult living", "Memory care", "Outdoor amenities"];
    const keyDetails = Array.from({ length: 12 }, (_, i) => `Research fact ${i + 1}`);
    const archetype = {
      ...DEFAULT_COMPOSE_ARTICLE_ARCHETYPE,
      sectionCount: 3,
      sampleHeadings: ["Opening conviction", "Principle in practice", "Closing stance"],
    };

    const outline = await planComposeOutline({
      topic: "",
      subtopics,
      keyDetails,
      archetype,
    });

    assert.equal(outline.sections.length, 3);
    for (const sub of subtopics) {
      assert.ok(
        !outline.sections.some((s) => s.heading.toLowerCase().includes(sub.toLowerCase())),
        `subtopic "${sub}" should not appear as a heading`,
      );
    }
  });
});

describe("formatComposeOutlineForPrompt", () => {
  it("serializes outline for reconstruction prompt", () => {
    const block = formatComposeOutlineForPrompt({
      sections: [
        { heading: "Chairs first", factSummary: "Sit test and comfort facts" },
        { heading: "Light matters", factSummary: "Circadian and glare facts" },
      ],
    });
    assert.match(block, /Editorial outline/);
    assert.match(block, /Chairs first/);
    assert.match(block, /Light matters/);
  });
});
