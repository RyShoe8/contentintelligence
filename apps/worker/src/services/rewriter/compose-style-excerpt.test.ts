import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildComposeStyleExampleExcerpt,
  buildRichExampleExcerpt,
  COMPOSE_MAX_TOTAL_CHARS,
  COMPOSE_STYLE_PROMPT_MAX_CHARS,
} from "./compose-style-excerpt.js";
import type { ArticleRewriteExample } from "./types.js";

const FIXTURE_HTML = `
<h2>We sit in every chair</h2>
<p>We never specify seating we have not tested ourselves.</p>
<p>That rule sounds simple. We take it seriously.</p>
`;

describe("buildRichExampleExcerpt", () => {
  it("includes signature paragraphs from kit before opening", () => {
    const excerpt = buildRichExampleExcerpt(FIXTURE_HTML, 4500, {
      headings: ["We sit in every chair"],
      openingParagraphs: ["We never specify seating we have not tested ourselves."],
      signatureParagraphs: ["We never specify seating we have not tested ourselves."],
      rhythmSample: "We watch how residents move in every community we visit.",
    });
    assert.ok(excerpt.includes("Signature paragraphs:"));
    assert.ok(excerpt.includes("We never specify seating"));
    assert.ok(excerpt.indexOf("Signature") < excerpt.indexOf("Opening"));
  });
});

describe("buildComposeStyleExampleExcerpt", () => {
  it("respects raised total char budget across examples", () => {
    const examples: ArticleRewriteExample[] = [
      { title: "A", html: FIXTURE_HTML, composeStyleKit: undefined },
      { title: "B", html: FIXTURE_HTML, composeStyleKit: undefined },
      { title: "C", html: FIXTURE_HTML, composeStyleKit: undefined },
    ];
    const excerpt = buildComposeStyleExampleExcerpt(examples);
    assert.ok(excerpt);
    assert.ok(excerpt!.length <= COMPOSE_MAX_TOTAL_CHARS + 50);
    assert.ok(excerpt!.includes("Example 1"));
    assert.ok(excerpt!.includes("Example 3"));
  });

  it("exports prompt max chars at 5000", () => {
    assert.equal(COMPOSE_STYLE_PROMPT_MAX_CHARS, 5000);
  });
});
