import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeReferenceLeakPlainTextIssues,
  sanitizeArticleHtmlForLearning,
  stripLeadingComposeChrome,
} from "./sanitize-article-html.js";

describe("sanitizeArticleHtmlForLearning", () => {
  it("removes back-to-blog link and share blocks inside article", () => {
    const html = `<article>
      <div class="back-to-blog"><a href="/blog">← Back to Blog</a></div>
      <div class="post-meta">October 12, 2023</div>
      <div class="social-share">Share Facebook LinkedIn</div>
      <p>Real article body about senior living design.</p>
    </article>`;
    const cleaned = sanitizeArticleHtmlForLearning(html);
    assert.doesNotMatch(cleaned, /Back to Blog/i);
    assert.doesNotMatch(cleaned, /Share Facebook/i);
    assert.match(cleaned, /Real article body/);
  });

  it("preserves substantive body content", () => {
    const html = "<p>We believe every space should feel like home.</p>";
    assert.equal(sanitizeArticleHtmlForLearning(html), html);
  });
});

describe("composeReferenceLeakPlainTextIssues", () => {
  it("detects back to blog and share chrome", () => {
    const plain = "← Back to BlogOctober 12, 2023\nShareFacebookLinkedIn\nBody text.";
    const issues = composeReferenceLeakPlainTextIssues(plain);
    assert.ok(issues.length > 0);
  });

  it("detects copied style example title at start", () => {
    const plain = "Crafting Homes: The Art of Senior Living Design\n\nAt Senior By Design, we believe…";
    const issues = composeReferenceLeakPlainTextIssues(plain, [
      "Crafting Homes: The Art of Senior Living Design",
    ]);
    assert.match(issues[0] ?? "", /copies style example title/i);
  });
});

describe("stripLeadingComposeChrome", () => {
  it("removes leading chrome paragraphs from HTML output", () => {
    const html = `<p>← Back to BlogOctober 12, 2023</p>
<p>Crafting Homes: The Art of Senior Living Design</p>
<p>ShareFacebookLinkedIn</p>
<p>At Senior By Design, we believe every space should feel like home.</p>`;
    const cleaned = stripLeadingComposeChrome(html);
    assert.doesNotMatch(cleaned, /Back to Blog/i);
    assert.match(cleaned, /At Senior By Design/);
  });
});
