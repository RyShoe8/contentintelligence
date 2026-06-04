import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureWriterLinksInHtml,
  parseWriterLinks,
  stripHtmlToPlainText,
  writerLinkParagraphIndices,
  writerLinkPresentInHtml,
  writerLinksClusteredAtEnd,
  writerLinksMissingFromHtml,
  writerLinksNeedRevision,
  writerLinksShallowOrFabricated,
  writerRewriteDivergenceScore,
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

describe("writerLinksClusteredAtEnd", () => {
  it("returns false when links are spread across the article", () => {
    const html = [
      '<p>Intro with <a href="https://a.example">A</a>.</p>',
      "<p>Middle body text.</p>",
      '<p>Later <a href="https://b.example">B</a> and more.</p>',
      '<p>End <a href="https://c.example">C</a>.</p>',
    ].join("\n");
    const links = [
      { url: "https://a.example" },
      { url: "https://b.example" },
      { url: "https://c.example" },
    ];
    assert.equal(writerLinksClusteredAtEnd(html, links), false);
  });

  it("returns true when all links are only in the last paragraphs", () => {
    const html = [
      "<p>Opening paragraph with no links.</p>",
      "<p>Second paragraph still no links.</p>",
      "<p>Third paragraph still no links.</p>",
      '<p>Fourth with <a href="https://a.example">A</a> and <a href="https://b.example">B</a>.</p>',
      '<p>Fifth with <a href="https://c.example">C</a>.</p>',
    ].join("\n");
    const links = [
      { url: "https://a.example" },
      { url: "https://b.example" },
      { url: "https://c.example" },
    ];
    assert.equal(writerLinksClusteredAtEnd(html, links), true);
  });

  it("returns false when any link is missing from html", () => {
    const html = '<p>Only <a href="https://a.example">A</a>.</p><p>End.</p>';
    assert.equal(
      writerLinksClusteredAtEnd(html, [
        { url: "https://a.example" },
        { url: "https://b.example" },
      ]),
      false,
    );
  });
});

describe("writerLinkParagraphIndices", () => {
  it("finds paragraph index for href", () => {
    const html = "<p>One.</p><p>Two <a href=\"https://x.example\">x</a>.</p>";
    assert.deepEqual(writerLinkParagraphIndices(html, "https://x.example"), [1]);
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

  it("accepts rewrite_divergence_min 0-100", () => {
    const parsed = writerRewriteInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      source_text: "x".repeat(WRITER_SOURCE_MIN_CHARS),
      rewrite_divergence_min: 50,
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.rewrite_divergence_min, 50);
  });
});

describe("stripHtmlToPlainText", () => {
  it("strips tags and normalizes whitespace", () => {
    assert.equal(
      stripHtmlToPlainText("<p>Hello <strong>world</strong>.</p>"),
      "Hello world.",
    );
  });
});

describe("writerRewriteDivergenceScore", () => {
  it("returns low score for near-identical text", () => {
    const source = "The quick brown fox jumps over the lazy dog repeatedly.";
    const html = "<p>The quick brown fox jumps over the lazy dog repeatedly.</p>";
    const score = writerRewriteDivergenceScore(source, html);
    assert.ok(score < 15, `expected low score, got ${score}`);
  });

  it("returns high score for disjoint vocabulary", () => {
    const source = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const html =
      "<p>lunar crater meteor orbit nebula quasar pulsar galaxy comet asteroid</p>";
    const score = writerRewriteDivergenceScore(source, html);
    assert.ok(score > 70, `expected high score, got ${score}`);
  });
});

describe("writerLinksShallowOrFabricated", () => {
  it("detects fabricated brand sentence when label absent from source", () => {
    const source = "x".repeat(WRITER_SOURCE_MIN_CHARS);
    const html =
      '<p>Body about workflows and tools in general.</p><p>Try <a href="https://tailnote.example">Tailnote</a> today.</p>';
    assert.equal(
      writerLinksShallowOrFabricated(source, html, [
        { url: "https://tailnote.example", label: "Tailnote" },
      ]),
      true,
    );
  });

  it("returns false for link in long body paragraph on existing topic", () => {
    const source =
      "This guide covers Tailnote and other workflow tools for teams building content pipelines. ".repeat(
        5,
      );
    const html = `<p>${source.trim()} See <a href="https://tailnote.example">Tailnote</a> for details on setup.</p>`;
    assert.equal(
      writerLinksShallowOrFabricated(source, html, [
        { url: "https://tailnote.example", label: "Tailnote" },
      ]),
      false,
    );
  });
});

describe("writerLinksNeedRevision", () => {
  it("triggers on shallow fabricated link", () => {
    const source = "x".repeat(WRITER_SOURCE_MIN_CHARS);
    const html = '<p>Short pitch for <a href="https://brand.example">BrandX</a>.</p>';
    assert.equal(
      writerLinksNeedRevision(html, [{ url: "https://brand.example", label: "BrandX" }], source),
      true,
    );
  });
});
