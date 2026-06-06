import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureWriterLinksInHtml,
  finalizeWriterLinksInHtml,
  parseWriterLinks,
  redistributeWriterLinksInBody,
  stripHtmlToPlainText,
  weaveMissingWriterLinksInBody,
  writerLinkParagraphIndices,
  writerLinkPresentInHtml,
  writerLinksClusteredAtEnd,
  writerLinksMissingFromHtml,
  writerLinksNeedSpread,
  writerLinksNeedRevision,
  writerLinksPresentCount,
  writerLinksShallowOrFabricated,
  writerNonRequestedLinksInHtml,
  writerRequestedLinksAdded,
  writerRequestedLinksCarriedFromSource,
  writerRewriteDivergenceScore,
  writerRewriteInputSchema,
  writerComposeInputSchema,
  parseWriterReferenceUrls,
  writerUrlInSourceText,
  WRITER_SOURCE_MIN_CHARS,
  WRITER_TOPIC_MIN_CHARS,
  WRITER_REFERENCE_URL_MAX,
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

  it("does not treat a shorter URL as present when only a longer href exists", () => {
    const html = '<p><a href="https://site.com/features">features</a></p>';
    assert.equal(writerLinkPresentInHtml(html, "https://site.com/features"), true);
    assert.equal(writerLinkPresentInHtml(html, "https://site.com"), false);
  });

  it("does not match plain-text URLs without an anchor", () => {
    const html = "<p>Visit https://example.com/deal for details.</p>";
    assert.equal(writerLinkPresentInHtml(html, "https://example.com/deal"), false);
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

describe("writerLinksNeedSpread", () => {
  it("returns true for a single link in the last paragraph", () => {
    const html = [
      "<p>Opening paragraph.</p>",
      "<p>Middle paragraph.</p>",
      "<p>Another middle paragraph.</p>",
      '<p>Closing with <a href="https://only.example">Only</a>.</p>',
    ].join("\n");
    assert.equal(
      writerLinksNeedSpread(html, [{ url: "https://only.example" }]),
      true,
    );
  });

  it("returns true when all links share one late paragraph", () => {
    const html = [
      "<p>One.</p>",
      "<p>Two.</p>",
      "<p>Three.</p>",
      '<p>Four with <a href="https://a.example">A</a>, <a href="https://b.example">B</a>, and <a href="https://c.example">C</a>.</p>',
    ].join("\n");
    const links = [
      { url: "https://a.example" },
      { url: "https://b.example" },
      { url: "https://c.example" },
    ];
    assert.equal(writerLinksNeedSpread(html, links), true);
  });

  it("returns false when links are spread across the article", () => {
    const html = [
      '<p>Intro <a href="https://a.example">A</a>.</p>',
      "<p>Middle body text.</p>",
      '<p>Later <a href="https://b.example">B</a>.</p>',
      '<p>End <a href="https://c.example">C</a>.</p>',
    ].join("\n");
    const links = [
      { url: "https://a.example" },
      { url: "https://b.example" },
      { url: "https://c.example" },
    ];
    assert.equal(writerLinksNeedSpread(html, links), false);
  });
});

describe("redistributeWriterLinksInBody", () => {
  it("spreads three links clustered in the last paragraph", () => {
    const html = [
      "<p>Opening paragraph one.</p>",
      "<p>Second paragraph two.</p>",
      "<p>Third paragraph three.</p>",
      '<p>Fourth with <a href="https://a.example">A</a>, <a href="https://b.example">B</a>, and <a href="https://c.example">C</a>.</p>',
    ].join("\n");
    const links = [
      { url: "https://a.example", label: "A" },
      { url: "https://b.example", label: "B" },
      { url: "https://c.example", label: "C" },
    ];
    const { html: out, redistributed } = redistributeWriterLinksInBody(html, links);
    assert.ok(redistributed >= 2);
    assert.equal(writerLinksPresentCount(out, links), 3);
    assert.equal(writerLinksNeedSpread(out, links), false);
    assert.ok(writerLinkParagraphIndices(out, "https://a.example")[0]! < 3);
    assert.ok(writerLinkParagraphIndices(out, "https://b.example")[0]! < 3);
  });

  it("moves a single last-paragraph link toward the middle", () => {
    const html = [
      "<p>Paragraph one.</p>",
      "<p>Paragraph two.</p>",
      "<p>Paragraph three.</p>",
      "<p>Paragraph four.</p>",
      '<p>Paragraph five with <a href="https://solo.example">Solo</a>.</p>',
    ].join("\n");
    const { html: out, redistributed } = redistributeWriterLinksInBody(html, [
      { url: "https://solo.example", label: "Solo" },
    ]);
    assert.equal(redistributed, 1);
    assert.ok(writerLinkParagraphIndices(out, "https://solo.example")[0]! <= 2);
  });

  it("leaves already-spread links unchanged", () => {
    const html = [
      '<p>Intro <a href="https://a.example">A</a>.</p>',
      "<p>Middle body text.</p>",
      '<p>Later <a href="https://b.example">B</a>.</p>',
    ].join("\n");
    const links = [{ url: "https://a.example" }, { url: "https://b.example" }];
    const { html: out, redistributed } = redistributeWriterLinksInBody(html, links);
    assert.equal(redistributed, 0);
    assert.equal(out, html);
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

describe("writerComposeInputSchema", () => {
  it("requires minimum topic length", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "short",
      reference_urls: [],
      links: [],
    });
    assert.equal(parsed.success, false);
  });

  it("accepts topic and reference urls", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "How to evaluate content marketing ROI for B2B teams",
      reference_urls: ["https://example.com/guide", "https://other.org/stats"],
      links: [{ url: "https://product.example", label: "Our tool" }],
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.reference_urls.length, 2);
  });

  it("rejects non-https reference urls", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      reference_urls: ["http://insecure.com"],
    });
    assert.equal(parsed.success, false);
  });
});

describe("parseWriterReferenceUrls", () => {
  it("parses valid https urls and skips invalid entries", () => {
    const urls = parseWriterReferenceUrls([
      "https://one.example",
      "ftp://bad.example",
      "",
      "https://two.example/path",
    ]);
    assert.deepEqual(urls, ["https://one.example", "https://two.example/path"]);
  });

  it("caps at WRITER_REFERENCE_URL_MAX", () => {
    const raw = Array.from({ length: 20 }, (_, i) => `https://site${i}.example`);
    const urls = parseWriterReferenceUrls(raw);
    assert.equal(urls.length, WRITER_REFERENCE_URL_MAX);
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

  it("accepts preserve_instructions boolean", () => {
    const parsed = writerRewriteInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      source_text: "x".repeat(WRITER_SOURCE_MIN_CHARS),
      preserve_instructions: true,
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.preserve_instructions, true);
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

  it("scores higher on phrase change when vocabulary overlaps", () => {
    const source =
      "Content marketing helps teams publish articles that rank in search and convert readers into customers over time.";
    const html =
      "<p>Search ranking and reader conversion still matter for teams publishing articles through content marketing over time.</p>";
    const score = writerRewriteDivergenceScore(source, html);
    assert.ok(score > 25, `expected phrase divergence, got ${score}`);
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

describe("weaveMissingWriterLinksInBody", () => {
  it("inserts missing links as inline anchors in body paragraphs", () => {
    const html = "<p>Intro paragraph one.</p><p>Middle paragraph two.</p><p>Closing paragraph three.</p>";
    const { html: out, woven } = weaveMissingWriterLinksInBody(html, [
      { url: "https://missing.example", label: "Missing" },
    ]);
    assert.equal(woven, 1);
    assert.equal(writerLinkPresentInHtml(out, "https://missing.example"), true);
    assert.doesNotMatch(out, /Related links/i);
  });
});

describe("finalizeWriterLinksInHtml", () => {
  it("weaves before appending related links", () => {
    const html = "<p>Only one <a href=\"https://one.example\">One</a>.</p><p>Second paragraph.</p>";
    const { html: out, linksWoven, linksAppended, linksRedistributed } = finalizeWriterLinksInHtml(html, [
      { url: "https://one.example" },
      { url: "https://two.example", label: "Two" },
    ]);
    assert.equal(linksWoven, 1);
    assert.equal(linksAppended, 0);
    assert.equal(linksRedistributed, 0);
    assert.equal(writerLinksPresentCount(out, [
      { url: "https://one.example" },
      { url: "https://two.example" },
    ]), 2);
    assert.doesNotMatch(out, /Related links/i);
  });

  it("redistributes links clustered at the end after weaving", () => {
    const html = [
      "<p>Opening paragraph one.</p>",
      "<p>Second paragraph two.</p>",
      "<p>Third paragraph three.</p>",
      '<p>Fourth with <a href="https://a.example">A</a>, <a href="https://b.example">B</a>, and <a href="https://c.example">C</a>.</p>',
    ].join("\n");
    const links = [
      { url: "https://a.example", label: "A" },
      { url: "https://b.example", label: "B" },
      { url: "https://c.example", label: "C" },
    ];
    const { html: out, linksRedistributed } = finalizeWriterLinksInHtml(html, links);
    assert.ok(linksRedistributed >= 2);
    assert.equal(writerLinksNeedSpread(out, links), false);
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

describe("writerUrlsInSourceText", () => {
  it("finds plain https URLs and anchor hrefs in source", () => {
    const source =
      "Read more at https://example.com/page and <a href=\"https://other.org/path\">here</a>.";
    assert.ok(writerUrlInSourceText(source, "https://example.com/page"));
    assert.ok(writerUrlInSourceText(source, "https://other.org/path"));
  });
});

describe("writerRequestedLinksCarriedFromSource", () => {
  it("counts requested URLs already in source and present in output", () => {
    const source = `Intro with https://already.example/deal and ${"x".repeat(80)}`;
    const html = '<p>See <a href="https://already.example/deal">deal</a>.</p>';
    const links = [
      { url: "https://already.example/deal" },
      { url: "https://new.example", label: "New" },
    ];
    assert.equal(writerRequestedLinksCarriedFromSource(source, html, links), 1);
    assert.equal(writerRequestedLinksAdded(source, html, links), 0);
  });

  it("counts newly added requested links not in source", () => {
    const source = `Plain article with no links. ${"x".repeat(80)}`;
    const html =
      '<p>See <a href="https://new.example">new</a> and <a href="https://already.example/deal">deal</a>.</p>';
    const links = [
      { url: "https://already.example/deal" },
      { url: "https://new.example", label: "New" },
    ];
    assert.equal(writerRequestedLinksCarriedFromSource(source, html, links), 0);
    assert.equal(writerRequestedLinksAdded(source, html, links), 2);
  });
});

describe("writerNonRequestedLinksInHtml", () => {
  it("counts anchors not in the requested link list", () => {
    const html =
      '<p><a href="https://source.example/old">old</a> and <a href="https://requested.example">req</a></p>';
    assert.equal(
      writerNonRequestedLinksInHtml(html, [{ url: "https://requested.example" }]),
      1,
    );
  });
});
