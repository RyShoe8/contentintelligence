import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildComposeStyleExampleExcerpt,
  buildRichExampleExcerpt,
  COMPOSE_MAX_TOTAL_CHARS,
  COMPOSE_PER_EXAMPLE_CHARS,
  COMPOSE_PER_EXAMPLE_CHARS_FEW,
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

  it("exports prompt max chars at 7000", () => {
    assert.equal(COMPOSE_STYLE_PROMPT_MAX_CHARS, 7000);
  });

  it("raises per-example budget when two or fewer examples", () => {
    assert.ok(COMPOSE_PER_EXAMPLE_CHARS_FEW > COMPOSE_PER_EXAMPLE_CHARS);
    const longParagraphs = Array.from(
      { length: 120 },
      (_, i) => `<p>We test paragraph number ${i} in a real community before we ever specify it for a client project anywhere.</p>`,
    ).join("");
    const longHtml = `<h2>We sit in every chair</h2>${longParagraphs}`;
    const fewExcerpt = buildComposeStyleExampleExcerpt([
      { title: "A", html: longHtml, composeStyleKit: undefined },
    ]);
    assert.ok(fewExcerpt);
    assert.ok(fewExcerpt!.length > COMPOSE_PER_EXAMPLE_CHARS);
  });
});

describe("closing block", () => {
  it("includes closing paragraphs in rich excerpt", () => {
    const html = [
      "<h2>We sit in every chair</h2>",
      "<p>We never specify seating we have not tested ourselves.</p>",
      "<p>That rule sounds simple. We take it seriously.</p>",
      "<p>We watch how residents move in every community we visit each week.</p>",
      "<p>Comfort matters, but durability matters more for daily use.</p>",
      "<p>Dignity is the standard we hold every single piece to.</p>",
      "<p>That is the chair test, and it never stops running.</p>",
    ].join("\n");
    const excerpt = buildRichExampleExcerpt(html, 4500);
    assert.ok(excerpt.includes("Closing:"));
    assert.ok(excerpt.includes("That is the chair test"));
  });
});
