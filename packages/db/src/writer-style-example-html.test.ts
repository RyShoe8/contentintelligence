import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writerStyleExampleHtmlFromPaste } from "./writer-style-example-html.js";

describe("writerStyleExampleHtmlFromPaste", () => {
  it("passes through HTML content unchanged", () => {
    const html = "<h2>Title</h2><p>Body copy.</p>";
    assert.equal(writerStyleExampleHtmlFromPaste(html), html);
  });

  it("wraps plain text paragraphs in p tags", () => {
    const result = writerStyleExampleHtmlFromPaste("First paragraph.\n\nSecond paragraph.");
    assert.match(result, /<p>First paragraph\.<\/p>/);
    assert.match(result, /<p>Second paragraph\.<\/p>/);
  });

  it("escapes HTML characters in plain text", () => {
    const result = writerStyleExampleHtmlFromPaste('Use 5" seat height & contrast.');
    assert.match(result, /5&quot; seat height &amp; contrast/);
  });
});
