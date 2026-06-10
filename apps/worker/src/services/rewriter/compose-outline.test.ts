import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_COMPOSE_ARTICLE_ARCHETYPE } from "./compose-article-archetype.js";
import {
  applyManifestoArchetypeOverride,
  buildOutlineSystemPrompt,
  extractStyleExampleHeadings,
  faqHeadingRole,
  formatComposeOutlineForPrompt,
  outlineRejectionRoleIssues,
  planComposeOutline,
} from "./compose-outline.js";
import { isGuidelinesManifestoTopic } from "./compose-topic-mode.js";

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

describe("buildOutlineSystemPrompt", () => {
  it("includes guidelines manifesto rules for broad guideline topics", () => {
    const prompt = buildOutlineSystemPrompt(DEFAULT_COMPOSE_ARTICLE_ARCHETYPE, {
      topic: "senior living design guidelines",
      includeFaq: true,
    });
    assert.match(prompt, /Guidelines manifesto mode/);
    assert.match(prompt, /test → reject → apply/);
    assert.ok(isGuidelinesManifestoTopic("senior living design guidelines"));
  });

  it("anchors FAQ section to archetype heading role", () => {
    const archetype = {
      ...DEFAULT_COMPOSE_ARTICLE_ARCHETYPE,
      sampleHeadings: ["We sit in every chair", "What we look for", "What we reject"],
    };
    assert.equal(faqHeadingRole(archetype), "What we reject");
    const prompt = buildOutlineSystemPrompt(archetype, { includeFaq: true });
    assert.match(prompt, /What we reject/);
    assert.match(prompt, /NOT a question-mark title/);
  });

  it("prefers question-ish FAQ roles over conviction roles", () => {
    const archetype = {
      ...DEFAULT_COMPOSE_ARTICLE_ARCHETYPE,
      sampleHeadings: ["What we reject", "What families ask us", "Closing stance"],
    };
    assert.equal(faqHeadingRole(archetype), "What families ask us");
  });

  it("includes concrete lens line when lens provided", () => {
    const prompt = buildOutlineSystemPrompt(DEFAULT_COMPOSE_ARTICLE_ARCHETYPE, {
      topic: "senior living design guidelines",
      concreteLens: "the dining room chair",
    });
    assert.match(prompt, /Anchor the article through this concrete lens: the dining room chair/);
  });

  it("omits lens line when no lens", () => {
    const prompt = buildOutlineSystemPrompt(DEFAULT_COMPOSE_ARTICLE_ARCHETYPE, {
      topic: "senior living design guidelines",
    });
    assert.ok(!prompt.includes("concrete lens"));
  });
});

describe("outlineRejectionRoleIssues", () => {
  it("flags rejection heading assigned neutral facts", () => {
    const issues = outlineRejectionRoleIssues({
      sections: [
        { heading: "What We Reject", factSummary: "Lighting research and acoustic comfort findings" },
      ],
    });
    assert.ok(issues.some((i) => i.includes("What We Reject")));
  });

  it("passes rejection heading with rejection facts", () => {
    const issues = outlineRejectionRoleIssues({
      sections: [
        { heading: "What We Reject", factSummary: "Materials we never specify and chairs we avoid" },
      ],
    });
    assert.equal(issues.length, 0);
  });
});

describe("applyManifestoArchetypeOverride", () => {
  it("forces single-threaded shape and caps sections for guideline topics", () => {
    const surveyArchetype = {
      ...DEFAULT_COMPOSE_ARTICLE_ARCHETYPE,
      sectionCount: 6,
      singleThreaded: false,
    };
    const overridden = applyManifestoArchetypeOverride(
      surveyArchetype,
      "senior living design guidelines",
    );
    assert.equal(overridden.singleThreaded, true);
    assert.equal(overridden.sectionCount, 4);
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
