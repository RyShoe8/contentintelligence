import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureWriterLinksInHtml,
  parseWriterLinks,
  writerLinkPresentInHtml,
  writerLinksMissingFromHtml,
  writerRewriteInputSchema,
  WRITER_SOURCE_MIN_CHARS,
} from "./writer-validation.js";

describe("parseWriterLinks", () => {
  it("accepts valid https links with labels", () => {
    const links = parseWriterLinks([
      { url: "https://example.com/page", label: "Example" },
      { url: "https://other.org" },
    ]);
    assert.equal(links.length, 2);
    assert.equal(links[0]?.url, "https://example.com/page");
    assert.equal(links[0]?.label, "Example");
  });

  it("rejects non-https URLs via schema in rewrite input", () => {
    const parsed = writerRewriteInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      source_text: "x".repeat(WRITER_SOURCE_MIN_CHARS),
      links: [{ url: "http://insecure.com" }],
    });
    assert.equal(parsed.success, false);
  });
});

describe("writerLinkPresentInHtml", () => {
  it("matches exact and trailing-slash href variants", () => {
    const html = '<p>See <a href="https://example.com/deal/">offer</a>.</p>';
    assert.equal(writerLinkPresentInHtml(html, "https://example.com/deal"), true);
    assert.equal(writerLinkPresentInHtml(html, "https://other.org"), false);
  });
});

describe("writerLinksMissingFromHtml", () => {
  it("returns links not found in html", () => {
    const html = '<a href="https://one.example">One</a>';
    const missing = writerLinksMissingFromHtml(html, [
      { url: "https://one.example" },
      { url: "https://two.example", label: "Two" },
    ]);
    assert.equal(missing.length, 1);
    assert.equal(missing[0]?.url, "https://two.example");
  });
});

describe("ensureWriterLinksInHtml", () => {
  it("leaves html unchanged when all links are present", () => {
    const html = '<p><a href="https://a.example">A</a> <a href="https://b.example">B</a></p>';
    const links = [{ url: "https://a.example" }, { url: "https://b.example" }];
    assert.equal(ensureWriterLinksInHtml(html, links), html);
  });

  it("appends related links block for missing urls", () => {
    const html = "<p>Intro only.</p>";
    const out = ensureWriterLinksInHtml(html, [
      { url: "https://casino.example/deal", label: "Claim offer" },
      { url: "https://blog.example/review" },
    ]);
    assert.match(out, /<h2>Related links<\/h2>/);
    assert.match(out, /href="https:\/\/casino\.example\/deal"/);
    assert.match(out, />Claim offer</);
    assert.match(out, /href="https:\/\/blog\.example\/review"/);
    assert.match(out, />blog\.example</);
  });
});

describe("writerRewriteInputSchema", () => {
  it("requires minimum source length", () => {
    const parsed = writerRewriteInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      source_text: "short",
      links: [],
    });
    assert.equal(parsed.success, false);
  });
});
