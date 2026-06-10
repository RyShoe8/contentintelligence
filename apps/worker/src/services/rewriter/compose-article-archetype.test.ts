import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractComposeArticleArchetype,
  pickPrimaryStyleExample,
  resolveComposeArticleArchetype,
} from "./compose-article-archetype.js";

const CHAIR_POST = `
<h2>We sit in every chair</h2>
<p>We never specify seating we have not tested ourselves.</p>
<h2>What we look for</h2>
<p>Comfort matters, but durability matters more.</p>
<h2>What we reject</h2>
<p>We reject catalog chairs that fail after six months.</p>
`;

describe("extractComposeArticleArchetype", () => {
  it("derives section count and headings from primary example", () => {
    const archetype = extractComposeArticleArchetype(CHAIR_POST);
    assert.equal(archetype.sectionCount, 3);
    assert.ok(archetype.sampleHeadings.some((h) => /sit in every chair/i.test(h)));
    assert.equal(archetype.singleThreaded, true);
    assert.ok(archetype.openingPattern?.includes("never specify"));
  });

  it("pickPrimaryStyleExample prefers richer kits", () => {
    const primary = pickPrimaryStyleExample([
      { title: "Thin", html: "<p>Short.</p>" },
      {
        title: "Rich",
        html: CHAIR_POST,
        composeStyleKit: {
          headings: ["We sit in every chair", "What we look for", "What we reject"],
          openingParagraphs: ["We never specify seating we have not tested ourselves."],
          signatureParagraphs: ["We never specify seating we have not tested ourselves."],
        },
      },
    ]);
    assert.equal(primary?.title, "Rich");
  });

  it("pickPrimaryStyleExample prefers punchy operator voice over long generic posts", () => {
    const longGeneric = "<h2>Understanding Active Adult Communities</h2>".repeat(20) +
      "<p>".repeat(50) +
      "Designers must consider wellness and outdoor spaces for memory care and assisted living residents. ".repeat(80) +
      "</p>";
    const primary = pickPrimaryStyleExample([
      {
        title: "Long survey",
        html: longGeneric,
        composeStyleKit: {
          headings: [
            "Understanding Active Adult Communities",
            "Memory Care Design Trends",
            "Outdoor Wellness Spaces",
            "Technology in Assisted Living",
            "Independent Living Innovations",
            "Looking Ahead",
          ],
          openingParagraphs: ["Senior living design requires thoughtful integration of many community types."],
          signatureParagraphs: [],
        },
      },
      {
        title: "Chair essay",
        html: CHAIR_POST,
        composeStyleKit: {
          headings: ["We sit in every chair", "What we look for", "What we reject"],
          openingParagraphs: ["We never specify seating we have not tested ourselves."],
          signatureParagraphs: ["We never specify seating we have not tested ourselves."],
        },
      },
    ]);
    assert.equal(primary?.title, "Chair essay");
  });

  it("resolveComposeArticleArchetype uses stored archetype when present", () => {
    const archetype = resolveComposeArticleArchetype([
      {
        title: "Stored",
        html: CHAIR_POST,
        composeStyleKit: {
          headings: [],
          openingParagraphs: [],
          signatureParagraphs: [],
          archetype: {
            sectionCount: 5,
            sampleHeadings: ["A", "B", "C", "D", "E"],
            singleThreaded: true,
          },
        },
      },
    ]);
    assert.equal(archetype.sectionCount, 5);
  });
});
