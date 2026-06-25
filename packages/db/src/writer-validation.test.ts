import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureWriterLinksInHtml,
  enforceWriterLinkAnchorLabels,
  finalizeWriterLinksInHtml,
  parseWriterLinks,
  parseWriterSubtopics,
  redistributeWriterLinksInBody,
  stripHtmlToPlainText,
  weaveMissingWriterLinksInBody,
  writerArticleDepthGuidance,
  writerArticleDepthLabel,
  writerArticleDisplayHtml,
  writerComposeResearchConfig,
  writerComposeBriefOutlineIssues,
  writerComposeConcretenessIssues,
  writerComposeFaqStyleIssues,
  writerComposeRhythmIssues,
  writerComposeSectionRoleIssues,
  writerComposeLinkIssues,
  writerComposeOperatorVoiceIssues,
  writerComposeReferenceLeakIssues,
  writerComposeTopicDriftIssues,
  writerComposeTopicSpecificityIssues,
  writerComposeHowToStructureIssues,
  writerComposeBrandMentionIssues,
  writerComposeDuplicateSectionIssues,
  collectComposeHardVoiceRetryIssues,
  hasComposeHardVoiceFailures,
  writerComposeHardVoiceIssues,
  writerComposeVoiceStyleIssues,
  writerHasRelatedLinksBlock,
  postReviseWriterLinksInHtml,
  writerLinkAnchorMatches,
  writerLinkParagraphIndices,
  writerLinkPresentInHtml,
  writerLinksClusteredAtEnd,
  writerLinksMissingFromHtml,
  writerLinksNeedSpread,
  writerLinksNeedRevision,
  writerLinksUnnaturalPlacement,
  writerLinksPresentCount,
  writerLinksShallowOrFabricated,
  writerNonRequestedLinksInHtml,
  writerRequestedLinksAdded,
  writerRequestedLinksCarriedFromSource,
  writerRewriteDivergenceScore,
  writerRewriteInputSchema,
  writerComposeInputSchema,
  parseWriterReferenceUrls,
  resolveComposeResearchedAtIso,
  resolveComposeWrittenAtIso,
  writerUrlInSourceText,
  WRITER_ARTICLE_DEPTH_DEFAULT,
  WRITER_SOURCE_MIN_CHARS,
  WRITER_TOPIC_MIN_CHARS,
  WRITER_REFERENCE_URL_MAX,
  WRITER_SUBTOPIC_MAX,
  WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT,
  WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT,
  WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT,
  WRITER_WEB_SEARCH_MAX_RESULTS_LIMIT,
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
      "<p>Opening paragraph one discusses A topics.</p>",
      "<p>Second paragraph two mentions B details.</p>",
      "<p>Third paragraph three covers C options.</p>",
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
      "<p>Paragraph two about Solo options.</p>",
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
    assert.equal(parsed.data?.deep_research, true);
    assert.equal(parsed.data?.web_search, true);
    assert.equal(parsed.data?.web_search_max_queries, WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT);
    assert.equal(parsed.data?.web_search_max_results, WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT);
  });

  it("defaults article_type to editorial", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.article_type, "editorial");
  });

  it("accepts explicit how_to article_type", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      article_type: "how_to",
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.article_type, "how_to");
  });

  it("defaults deep_research and web_search to true", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.deep_research, true);
    assert.equal(parsed.data?.web_search, true);
  });

  it("accepts explicit deep_research and web_search flags", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      deep_research: false,
      web_search: false,
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.deep_research, false);
    assert.equal(parsed.data?.web_search, false);
  });

  it("defaults web search limits when omitted", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.web_search_max_queries, WRITER_WEB_SEARCH_MAX_QUERIES_DEFAULT);
    assert.equal(parsed.data?.web_search_max_results, WRITER_WEB_SEARCH_MAX_RESULTS_DEFAULT);
  });

  it("accepts explicit web search limits within bounds", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      web_search_max_queries: 7,
      web_search_max_results: 10,
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.web_search_max_queries, 7);
    assert.equal(parsed.data?.web_search_max_results, 10);
  });

  it("rejects web search limits above schema max", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      web_search_max_queries: WRITER_WEB_SEARCH_MAX_QUERIES_LIMIT + 1,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects non-https reference urls", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      reference_urls: ["http://insecure.com"],
    });
    assert.equal(parsed.success, false);
  });

  it("defaults article_depth and subtopics", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.article_depth, WRITER_ARTICLE_DEPTH_DEFAULT);
    assert.deepEqual(parsed.data?.subtopics, []);
  });

  it("accepts article_depth and subtopics within bounds", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      article_depth: 80,
      subtopics: ["Pricing models", "Implementation timeline"],
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.article_depth, 80);
    assert.equal(parsed.data?.subtopics.length, 2);
  });

  it("defaults include_faq to false and accepts true", () => {
    const defaulted = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
    });
    assert.equal(defaulted.success, true);
    assert.equal(defaulted.data?.include_faq, false);

    const enabled = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      include_faq: true,
    });
    assert.equal(enabled.success, true);
    assert.equal(enabled.data?.include_faq, true);
  });

  it("defaults skip_research to false", () => {
    const parsed = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.skip_research, false);
  });

  it("requires writer_article_id and research_brief when skip_research is true", () => {
    const missingArticle = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      skip_research: true,
      research_brief: "x".repeat(WRITER_SOURCE_MIN_CHARS),
    });
    assert.equal(missingArticle.success, false);

    const missingBrief = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      writer_article_id: "00000000-0000-4000-8000-000000000002",
      skip_research: true,
    });
    assert.equal(missingBrief.success, false);

    const valid = writerComposeInputSchema.safeParse({
      voice_id: "00000000-0000-4000-8000-000000000001",
      topic: "x".repeat(WRITER_TOPIC_MIN_CHARS),
      writer_article_id: "00000000-0000-4000-8000-000000000002",
      skip_research: true,
      research_brief: "x".repeat(WRITER_SOURCE_MIN_CHARS),
    });
    assert.equal(valid.success, true);
    assert.equal(valid.data?.skip_research, true);
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

describe("parseWriterSubtopics", () => {
  it("parses lines, dedupes case-insensitively, and caps at max", () => {
    const topics = parseWriterSubtopics([
      "Pricing models",
      "pricing models",
      "  Implementation timeline  ",
      "ab",
      "Fourth topic here",
      "Fifth topic here",
      "Sixth topic here",
      "Seventh topic here",
      "Eighth topic here",
      "Ninth topic here",
    ]);
    assert.equal(topics.length, WRITER_SUBTOPIC_MAX);
    assert.equal(topics[0], "Pricing models");
    assert.equal(topics[1], "Implementation timeline");
    assert.ok(!topics.some((t) => t.toLowerCase() === "ab"));
  });

  it("parses newline-separated string input", () => {
    const topics = parseWriterSubtopics("First subtopic\nSecond subtopic");
    assert.deepEqual(topics, ["First subtopic", "Second subtopic"]);
  });
});

describe("writerArticleDisplayHtml", () => {
  it("prefers final_html over generated_html", () => {
    assert.equal(
      writerArticleDisplayHtml({
        final_html: "<p>Saved edit</p>",
        generated_html: "<p>Generated draft</p>",
      }),
      "<p>Saved edit</p>",
    );
  });

  it("falls back to generated_html when final_html is empty", () => {
    assert.equal(
      writerArticleDisplayHtml({
        generated_html: "<p>Generated draft</p>",
      }),
      "<p>Generated draft</p>",
    );
  });
});

describe("writerArticleDepthGuidance", () => {
  it("maps depth tiers to word targets", () => {
    assert.equal(writerArticleDepthLabel(10), "Overview");
    assert.equal(writerArticleDepthGuidance(10).minWords, 700);
    assert.equal(writerArticleDepthLabel(40), "Standard");
    assert.equal(writerArticleDepthGuidance(40).minWords, 1200);
    assert.equal(writerArticleDepthLabel(60), "In-depth");
    assert.equal(writerArticleDepthGuidance(60).minWords, 2000);
    assert.equal(writerArticleDepthLabel(90), "Comprehensive");
    assert.equal(writerArticleDepthGuidance(90).minWords, 3000);
  });
});

describe("writerComposeResearchConfig", () => {
  it("scales research intensity with article depth", () => {
    assert.equal(writerComposeResearchConfig(20).maxResearchQuestions, 6);
    assert.equal(writerComposeResearchConfig(20).sectionBatchSize, 2);
    assert.equal(writerComposeResearchConfig(40).maxResearchQuestions, 8);
    assert.equal(writerComposeResearchConfig(60).maxResearchQuestions, 10);
    assert.equal(writerComposeResearchConfig(60).sectionBatchSize, 1);
    assert.equal(writerComposeResearchConfig(90).maxResearchQuestions, 12);
    assert.equal(writerComposeResearchConfig(90).gapFillPass, true);
    assert.equal(writerComposeResearchConfig(90).minCitationsPerSection, 3);
  });
});

describe("writerComposeTopicDriftIssues", () => {
  it("flags brand-as-subject and meta community framing", () => {
    const html = `
      <p>The Frugal Gambler community loves discussing taxes.</p>
      <p>Frugal Gambler encourages community engagement and creating engaging content.</p>
      <p>Fostering community around tax topics helps everyone.</p>
    `;
    const issues = writerComposeTopicDriftIssues(
      html,
      "Tax implications of online casino winnings",
      "Frugal Gambler",
    );
    assert.ok(issues.some((i) => /community/i.test(i)));
    assert.ok(issues.some((i) => /meta|community framing/i.test(i)));
  });

  it("returns no issues for topic-focused copy", () => {
    const html = `
      <h2>Reporting requirements</h2>
      <p>Online casino winnings are taxable income under federal law and must be reported to the IRS.</p>
      <p>State tax rates on gambling winnings vary by jurisdiction.</p>
    `;
    const issues = writerComposeTopicDriftIssues(
      html,
      "Tax implications of online casino winnings",
      "Frugal Gambler",
    );
    assert.equal(issues.length, 0);
  });
});

describe("writerComposeTopicSpecificityIssues", () => {
  it("flags generic Apple Mail how-to missing platform and HTML subtopic terms", () => {
    const html = `
      <h2>Understanding email signatures</h2>
      <p>Email signatures help recipients know who you are.</p>
      <h2>Best practices for signatures</h2>
      <p>Keep your signature concise and professional.</p>
    `;
    const issues = writerComposeTopicSpecificityIssues(
      html,
      "How to setup your email signature in Apple Mail",
      ["Import a custom HTML signature file"],
    );
    assert.ok(issues.some((i) => /apple/i.test(i)));
    assert.ok(issues.some((i) => /html|subtopic/i.test(i)));
  });

  it("returns no issues when platform and subtopic steps are present", () => {
    const html = `
      <h2>Apple Mail signature setup</h2>
      <ol>
        <li>Open Mail &gt; Settings &gt; Signatures.</li>
        <li>Choose your account and click the + button.</li>
      </ol>
      <h3>Import a custom HTML signature file</h3>
      <ol>
        <li>Save your .html signature file to disk.</li>
        <li>In Apple Mail, drag the HTML file into the signature preview.</li>
      </ol>
    `;
    const issues = writerComposeTopicSpecificityIssues(
      html,
      "How to setup your email signature in Apple Mail",
      ["Import a custom HTML signature file"],
    );
    assert.equal(issues.length, 0);
  });
});

describe("writerComposeHowToStructureIssues", () => {
  it("flags essay-style how-to without ordered steps", () => {
    const html = `
      <h2>Setting the Stage for Your Email Signature</h2>
      <p>Your signature matters.</p>
      <h2>Why a Well-Designed Signature Matters</h2>
      <p>Brand consistency builds trust.</p>
    `;
    const issues = writerComposeHowToStructureIssues(
      html,
      "How to setup your email signature in Apple Mail",
    );
    assert.ok(issues.some((i) => /ordered list/i.test(i)));
    assert.ok(issues.some((i) => /essay heading/i.test(i)));
  });

  it("passes when ordered steps and platform terms are present", () => {
    const html = `
      <h2>Apple Mail signature setup</h2>
      <ol>
        <li>Open Mail &gt; Settings &gt; Signatures.</li>
        <li>Click + to add a signature.</li>
        <li>Paste your HTML and send a test email.</li>
      </ol>
    `;
    const issues = writerComposeHowToStructureIssues(
      html,
      "How to setup your email signature in Apple Mail",
    );
    assert.equal(issues.length, 0);
  });
});

describe("writerComposeBrandMentionIssues", () => {
  it("requires brand name when mention level is sometimes", () => {
    const html = "<p>We set up Apple Mail signatures every week.</p>";
    const issues = writerComposeBrandMentionIssues(html, "Acme Signs", 50);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!, /Acme Signs/);
  });

  it("passes when brand name appears at sometimes level", () => {
    const html = "<p>At Acme Signs, we configure Apple Mail signatures daily.</p>";
    assert.equal(writerComposeBrandMentionIssues(html, "Acme Signs", 50).length, 0);
  });
});

describe("writerComposeDuplicateSectionIssues", () => {
  it("ignores duplicate headings for editorial articles", () => {
    const html = `
      <h2>Overview</h2><p>One</p>
      <h2>Overview</h2><p>Two</p>
    `;
    assert.equal(writerComposeDuplicateSectionIssues(html, "editorial").length, 0);
  });

  it("flags duplicate headings for how-to articles", () => {
    const html = `
      <h2>Apple Mail setup</h2><ol><li>Step one</li></ol>
      <h2>Apple Mail setup</h2><ol><li>Step one again</li></ol>
    `;
    const issues = writerComposeDuplicateSectionIssues(html, "how_to");
    assert.ok(issues.some((i) => /duplicate section heading/i.test(i)));
  });

  it("flags FAQ-style question headings before the FAQ section", () => {
    const html = `
      <h2>Can I use HTML?</h2><p>Yes, with a file.</p>
      <h2>Does Apple Mail support images?</h2><p>Yes.</p>
      <h2>FAQ</h2>
      <h3>Can I use HTML?</h3><p>Yes.</p>
    `;
    const issues = writerComposeDuplicateSectionIssues(html, "how_to", true);
    assert.ok(
      issues.some((i) => /FAQ-style question headings appear in the body/i.test(i)),
    );
  });
});

describe("enforceWriterLinkAnchorLabels", () => {
  it("replaces wrong anchor text with user label when label appears in paragraph", () => {
    const html = '<p>See the Exact Label guide at <a href="https://example.com/page">wrong text</a>.</p>';
    const out = enforceWriterLinkAnchorLabels(html, [
      { url: "https://example.com/page", label: "Exact Label" },
    ]);
    assert.match(out, />Exact Label<\/a>/);
    assert.doesNotMatch(out, /wrong text/);
  });

  it("escapes HTML in labels when label appears in paragraph", () => {
    const html =
      '<p>Read about A &amp; B products at <a href="https://example.com">old</a>.</p>';
    const out = enforceWriterLinkAnchorLabels(html, [
      { url: "https://example.com", label: "A & B products" },
    ]);
    assert.match(out, />A &amp; B products<\/a>/);
  });

  it("does not force multi-word label when only a partial word was woven", () => {
    const html = "<p>Thoughtfully chosen firm elements for your project.</p>";
    const woven = weaveMissingWriterLinksInBody(
      html,
      [{ url: "https://firm.example", label: "our firm" }],
      { exactAnchorLabels: false },
    ).html;
    const partialWoven =
      woven !== html
        ? woven
        : '<p>Thoughtfully chosen <a href="https://firm.example">firm</a> elements for your project.</p>';
    const out = enforceWriterLinkAnchorLabels(partialWoven, [
      { url: "https://firm.example", label: "our firm" },
    ]);
    assert.doesNotMatch(out, /our firm elements/i);
    assert.match(out, /<a href="https:\/\/firm\.example">firm<\/a>/);
  });
});

describe("writerLinkAnchorMatches", () => {
  it("returns true when label matches case-insensitively", () => {
    const html = '<p><a href="https://example.com">Exact Label</a></p>';
    assert.equal(
      writerLinkAnchorMatches(html, { url: "https://example.com", label: "exact label" }),
      true,
    );
  });

  it("returns false when anchor text differs", () => {
    const html = '<p><a href="https://example.com">Wrong</a></p>';
    assert.equal(
      writerLinkAnchorMatches(html, { url: "https://example.com", label: "Expected" }),
      false,
    );
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
  it("inserts missing links as inline anchors when label text appears in a paragraph", () => {
    const html =
      "<p>Intro paragraph one.</p><p>Middle paragraph about Missing items.</p><p>Closing paragraph three.</p>";
    const { html: out, woven } = weaveMissingWriterLinksInBody(html, [
      { url: "https://missing.example", label: "Missing" },
    ]);
    assert.equal(woven, 1);
    assert.equal(writerLinkPresentInHtml(out, "https://missing.example"), true);
    assert.doesNotMatch(out, /\(\s*<a\b/i);
    assert.doesNotMatch(out, /\bSee\s+<a\b/i);
    assert.doesNotMatch(out, /Related links/i);
  });

  it("does not append parenthetical or See links when label is absent from paragraph", () => {
    const html = "<p>Intro paragraph one.</p><p>Middle paragraph two.</p><p>Closing paragraph three.</p>";
    const { html: out, woven } = weaveMissingWriterLinksInBody(html, [
      { url: "https://missing.example", label: "Missing" },
    ]);
    assert.equal(woven, 0);
    assert.equal(writerLinkPresentInHtml(out, "https://missing.example"), false);
    assert.doesNotMatch(out, /\(\s*<a\b/i);
    assert.doesNotMatch(out, /\bSee\s+<a\b/i);
  });

  it("does not partial-match multi-word labels when exactAnchorLabels is true", () => {
    const html = "<p>Thoughtfully chosen firm elements for your project.</p>";
    const { html: out, woven } = weaveMissingWriterLinksInBody(
      html,
      [{ url: "https://firm.example", label: "our firm" }],
      { exactAnchorLabels: true },
    );
    assert.equal(woven, 0);
    assert.equal(writerLinkPresentInHtml(out, "https://firm.example"), false);
  });

  it("does not match label inside a larger word", () => {
    const html = "<p>MissingLink integration is documented here.</p>";
    const { html: out, woven } = weaveMissingWriterLinksInBody(html, [
      { url: "https://missing.example", label: "Missing" },
    ]);
    assert.equal(woven, 0);
    assert.equal(writerLinkPresentInHtml(out, "https://missing.example"), false);
  });
});

describe("writerLinksUnnaturalPlacement", () => {
  it("flags parenthetical anchor afterthoughts", () => {
    const html = '<p>We can help with your project (<a href="https://firm.example">our firm</a>).</p>';
    const links = [{ url: "https://firm.example", label: "our firm" }];
    assert.equal(writerLinksUnnaturalPlacement(html, links), true);
  });

  it("flags trailing See anchor patterns", () => {
    const html = '<p>Learn more about options. See <a href="https://guide.example">this guide</a>.</p>';
    const links = [{ url: "https://guide.example", label: "this guide" }];
    assert.equal(writerLinksUnnaturalPlacement(html, links), true);
  });

  it("returns false for inline links in normal sentence grammar", () => {
    const html = '<p>Contact <a href="https://firm.example">our firm</a> for a consultation.</p>';
    const links = [{ url: "https://firm.example", label: "our firm" }];
    assert.equal(writerLinksUnnaturalPlacement(html, links), false);
  });
});

describe("writerComposeBriefOutlineIssues", () => {
  it("flags research-brief section headings", () => {
    const html =
      "<h2>Topic overview</h2><p>Intro</p><h2>Key facts</h2><p>Fact one</p>";
    const issues = writerComposeBriefOutlineIssues(html);
    assert.ok(issues.some((i) => i.includes("Topic overview")));
    assert.ok(issues.some((i) => i.includes("Key facts")));
  });

  it("passes editorial headings", () => {
    const html = "<h2>How taxes work on casino winnings</h2><p>Fact one</p>";
    assert.equal(writerComposeBriefOutlineIssues(html).length, 0);
  });
});

describe("writerComposeVoiceStyleIssues", () => {
  it("flags textbook headings and generic guide phrases", () => {
    const html =
      "<h2>Understanding the Spectrum</h2><p>The landscape of senior living design plays a crucial role in outcomes. Designers and planners must remain mindful of every detail.</p>";
    const issues = writerComposeVoiceStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Understanding the Spectrum")));
    assert.ok(issues.some((i) => i.includes("landscape of")));
  });

  it("flags innovative design trends heading variant", () => {
    const html =
      "<h2>Innovative Design Trends in Senior Living</h2><p>We take a selective approach.</p>";
    const issues = writerComposeVoiceStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Innovative Design Trends")));
  });

  it("flags long paragraphs", () => {
    const words = Array.from({ length: 70 }, (_, i) => `word${i}`).join(" ");
    const html = `<h2>We test chairs</h2><p>${words}</p>`;
    const issues = writerComposeVoiceStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("70 words")));
  });

  it("passes short editorial paragraphs", () => {
    const html =
      "<h2>We sit in every chair</h2><p>We never specify seating we have not tested.</p><p>That rule sounds simple. We take it seriously.</p>";
    assert.equal(writerComposeVoiceStyleIssues(html).length, 0);
  });

  it("flags Got Questions FAQ-style headings", () => {
    const html =
      "<h2>Got Questions? We've Got Answers!</h2><p>We answer common questions below.</p>";
    const issues = writerComposeVoiceStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Got Questions")));
  });

  it("flags Independence Matters heading", () => {
    const html = "<h2>Independence Matters</h2><p>We design for dignity.</p>";
    const issues = writerComposeVoiceStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Independence Matters")));
  });

  it("flags shaping the future and holistic wellness guide patterns", () => {
    const html =
      "<h2>Shaping the Future of Senior Living</h2><p>Communities that foster connections and holistic wellness can make a difference for residents.</p>";
    const issues = writerComposeVoiceStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Shaping the Future")));
    assert.ok(issues.some((i) => i.includes("foster connections")));
    assert.ok(issues.some((i) => i.includes("holistic wellness")));
  });

  it("flags designing with residents heading", () => {
    const html = "<h2>Designing with Residents in Mind</h2><p>We test every layout ourselves.</p>";
    const issues = writerComposeVoiceStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Designing with Residents")));
  });

  it("flags rethinking and in-action headings plus new guide phrases", () => {
    const html =
      "<h2>Rethinking Senior Living Design</h2><h2>Our Philosophy in Action</h2><p>Bathrooms boast walk-in showers that pave the way for safety, and the results speak volumes because comfort and dignity go hand in hand.</p>";
    const issues = writerComposeVoiceStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Rethinking Senior Living Design")));
    assert.ok(issues.some((i) => i.includes("Philosophy in Action")));
    assert.ok(issues.some((i) => i.includes("pave the way")));
    assert.ok(issues.some((i) => i.includes("speak volumes")));
    assert.ok(issues.some((i) => i.includes("go hand in hand")));
    assert.ok(issues.some((i) => i.includes("boast")));
  });

  it("flags our-commitment-to heading and checkbox phrase", () => {
    const html =
      "<h2>Our Commitment to Excellence</h2><p>Safety isn't just a checkbox for us; it caters to the whole person.</p>";
    const issues = writerComposeVoiceStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Our Commitment to Excellence")));
    assert.ok(issues.some((i) => i.includes("isn't just a checkbox")));
  });
});

describe("writerComposeHardVoiceIssues", () => {
  it("aggregates voice style and brief outline issues", () => {
    const html =
      "<h2>Topic overview</h2><h2>Innovative Trends Ahead</h2><p>The landscape of design plays a crucial role.</p>";
    const issues = writerComposeHardVoiceIssues(html);
    assert.ok(issues.some((i) => i.includes("Topic overview")));
    assert.ok(issues.some((i) => i.includes("Innovative Trends")));
  });

  it("hasComposeHardVoiceFailures returns false for clean editorial copy", () => {
    const html =
      "<h2>We sit in every chair</h2><p>We never specify seating we have not tested.</p>";
    assert.equal(hasComposeHardVoiceFailures(html), false);
  });

  it("collectComposeHardVoiceRetryIssues dedupes issues", () => {
    const html = "<h2>Understanding the Basics</h2><p>Body.</p>";
    const issues = collectComposeHardVoiceRetryIssues(html);
    assert.ok(issues.length >= 1);
    assert.equal(new Set(issues).size, issues.length);
  });
});

describe("writerComposeConcretenessIssues", () => {
  it("flags abstract copy with no numbers or proper nouns", () => {
    const sentence =
      "Good design supports wellbeing and fosters a sense of belonging for residents and their families across every shared space. ";
    const html = `<p>${sentence.repeat(20)}</p>`;
    const issues = writerComposeConcretenessIssues(html);
    assert.ok(issues.some((i) => i.includes("reads abstract")));
  });

  it("passes specific copy with numbers and named places", () => {
    const sentence =
      "Only 10% of chairs pass the test at our 35,000 square foot Design Center in Dallas, where Sarah Thompson checks each 10-year warranty herself. ";
    const html = `<p>${sentence.repeat(15)}</p>`;
    assert.equal(writerComposeConcretenessIssues(html).length, 0);
  });

  it("skips short articles", () => {
    const html = "<p>Good design supports wellbeing and belonging.</p>";
    assert.equal(writerComposeConcretenessIssues(html).length, 0);
  });
});

describe("writerComposeRhythmIssues", () => {
  it("flags uniform long paragraphs with no bold lines", () => {
    const longP = `<p>${"This paragraph contains a steady flow of medium length sentences that never break stride or land a short punchy statement anywhere in the body. ".repeat(3)}</p>`;
    const html = longP.repeat(7);
    const issues = writerComposeRhythmIssues(html);
    assert.ok(issues.some((i) => i.includes("No rhythm variation")));
  });

  it("passes copy with short punchy paragraphs", () => {
    const longP = `<p>${"This paragraph contains a steady flow of medium length sentences that never break stride or land a short punchy statement anywhere in the body. ".repeat(3)}</p>`;
    const html = `${longP}<p>Every. Single. One.</p>${longP.repeat(6)}`;
    assert.equal(writerComposeRhythmIssues(html).length, 0);
  });

  it("passes copy with bold conviction lines", () => {
    const longP = `<p>${"This paragraph contains a steady flow of medium length sentences that never break stride or land a short punchy statement anywhere in the body. ".repeat(3)}</p>`;
    const html = `${longP}<p>${"We test everything before it reaches a community because <strong>a chair is never just a chair</strong> and details carry the entire experience for residents. ".repeat(3)}</p>${longP.repeat(5)}`;
    assert.equal(writerComposeRhythmIssues(html).length, 0);
  });
});

describe("writerComposeSectionRoleIssues", () => {
  it("flags rejection heading over neutral body", () => {
    const html =
      "<h2>What We Reject</h2><p>Research shows that lighting and acoustics influence resident comfort in measurable ways across many communities.</p>";
    const issues = writerComposeSectionRoleIssues(html);
    assert.ok(issues.some((i) => i.includes("What We Reject")));
  });

  it("passes rejection heading with actual rejections", () => {
    const html =
      "<h2>What We Reject</h2><p>We reject chairs that look fine in a catalog but fail after six months of daily use in a real community.</p>";
    assert.equal(writerComposeSectionRoleIssues(html).length, 0);
  });

  it("ignores non-rejection headings", () => {
    const html =
      "<h2>The Dining Room</h2><p>Research shows that lighting and acoustics influence resident comfort in measurable ways.</p>";
    assert.equal(writerComposeSectionRoleIssues(html).length, 0);
  });

  it("is included in hard voice issues", () => {
    const html =
      "<h2>What We Stand Against</h2><p>Communities increasingly recognize that environment matters and research highlights several relevant findings for many operators today.</p>";
    const issues = writerComposeHardVoiceIssues(html);
    assert.ok(issues.some((i) => i.includes("promises rejection")));
  });
});

describe("writerComposeReferenceLeakIssues", () => {
  it("flags blog chrome in compose output", () => {
    const html = "<p>← Back to BlogOctober 12, 2023</p><p>ShareFacebookLinkedIn</p><p>Body copy.</p>";
    const issues = writerComposeReferenceLeakIssues(html);
    assert.ok(issues.length > 0);
  });

  it("flags copied style example titles", () => {
    const html = "<p>Crafting Homes: The Art of Senior Living Design</p><p>We believe every space should feel like home.</p>";
    const issues = writerComposeReferenceLeakIssues(html, [
      "Crafting Homes: The Art of Senior Living Design",
    ]);
    assert.ok(issues.some((i) => i.includes("copies style example title")));
  });
});

describe("writerComposeOperatorVoiceIssues", () => {
  it("flags low we-voice density in long articles", () => {
    const words = Array.from({ length: 200 }, () => "designers").join(" ");
    const html = `<p>${words}</p>`;
    const issues = writerComposeOperatorVoiceIssues(html);
    assert.ok(issues.some((i) => i.includes("Low first-person operator voice")));
  });
});

describe("writerComposeFaqStyleIssues", () => {
  it("flags boilerplate FAQ title and long answers", () => {
    const longAnswer = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const html = [
      "<h2>Your Questions Answered</h2>",
      "<h3>What is design?</h3><p>" + longAnswer + "</p>",
      "<h3>Why chairs?</h3><p>" + longAnswer + "</p>",
      "<h3>Who decides?</h3><p>" + longAnswer + "</p>",
    ].join("");
    const issues = writerComposeFaqStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Your Questions Answered")));
    assert.ok(issues.some((i) => i.includes("FAQ answers average")));
  });

  it("flags FAQ answers that copy research brief wording", () => {
    const sourceAnswer =
      "Federal withholding may apply to large casino winnings and state tax rules vary significantly across jurisdictions for reporting purposes.";
    const html = `<h2>Questions we hear</h2><h3>Do I owe tax?</h3><p>${sourceAnswer}</p>`;
    const issues = writerComposeFaqStyleIssues(html, [
      { question: "Do I owe tax?", answer: sourceAnswer },
    ]);
    assert.ok(issues.some((i) => i.includes("copies research brief wording")));
  });

  it("flags curious-about FAQ section titles", () => {
    const html = "<h2>Curious About Common Questions?</h2><h3>What is design?</h3><p>Short answer.</p>";
    const issues = writerComposeFaqStyleIssues(html);
    assert.ok(issues.some((i) => i.includes("Curious About Common Questions?")));
  });
});

describe("writerComposeLinkIssues", () => {
  it("flags Related links block and missing URLs", () => {
    const html = "<p>Body copy.</p><h2>Related links</h2><ul><li><a href=\"https://one.example\">One</a></li></ul>";
    const links = [
      { url: "https://one.example" },
      { url: "https://two.example", label: "our team" },
    ];
    const issues = writerComposeLinkIssues(html, links, "Body copy about design.");
    assert.ok(issues.some((i) => i.includes("Related links")));
    assert.ok(issues.some((i) => i.includes("missing")));
  });
});

describe("postReviseWriterLinksInHtml allowAppendedLinks", () => {
  it("does not append Related links when allowAppendedLinks is false", () => {
    const html = "<p>Body without links.</p>";
    const links = [{ url: "https://team.example", label: "our team" }];
    const { html: out, linksAppended } = postReviseWriterLinksInHtml(html, links, {
      allowAppendedLinks: false,
    });
    assert.equal(linksAppended, 0);
    assert.equal(writerHasRelatedLinksBlock(out), false);
    assert.equal(writerLinksMissingFromHtml(out, links).length, 1);
  });
});

describe("finalizeWriterLinksInHtml", () => {
  it("weaves before appending related links", () => {
    const html =
      '<p>Topics One and Two with <a href="https://one.example">One</a>.</p><p>Second paragraph.</p>';
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

  it("appends Related links instead of parenthetical body inserts when label absent", () => {
    const html = '<p>Only one <a href="https://one.example">One</a>.</p><p>Second paragraph.</p>';
    const { html: out, linksWoven, linksAppended } = finalizeWriterLinksInHtml(html, [
      { url: "https://one.example" },
      { url: "https://two.example", label: "Two" },
    ]);
    assert.equal(linksWoven, 0);
    assert.equal(linksAppended, 1);
    const body = out.split(/<h2\b[^>]*>\s*Related links\s*<\/h2>/i)[0] ?? out;
    assert.doesNotMatch(body, /\(\s*<a\b/i);
    assert.match(out, /Related links/i);
  });

  it("redistributes links clustered at the end after weaving", () => {
    const html = [
      "<p>Opening paragraph one discusses A topics.</p>",
      "<p>Second paragraph two mentions B details.</p>",
      "<p>Third paragraph three covers C options.</p>",
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

  it("enforces user anchor labels after redistribution", () => {
    const html = [
      "<p>Opening paragraph one discusses Label A topics.</p>",
      "<p>Second paragraph two mentions Label B details.</p>",
      "<p>Third paragraph three covers Label C options.</p>",
      '<p>Fourth discusses Label A, Label B, and Label C with <a href="https://a.example">wrong A</a>, <a href="https://b.example">wrong B</a>, and <a href="https://c.example">wrong C</a>.</p>',
    ].join("\n");
    const links = [
      { url: "https://a.example", label: "Label A" },
      { url: "https://b.example", label: "Label B" },
      { url: "https://c.example", label: "Label C" },
    ];
    const { html: out } = finalizeWriterLinksInHtml(html, links);
    assert.equal(writerLinkAnchorMatches(out, links[0]!), true);
    assert.equal(writerLinkAnchorMatches(out, links[1]!), true);
    assert.equal(writerLinkAnchorMatches(out, links[2]!), true);
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

  it("triggers on parenthetical link placement", () => {
    const source = "x".repeat(WRITER_SOURCE_MIN_CHARS);
    const html = '<p>We can help (<a href="https://firm.example">our firm</a>).</p>';
    assert.equal(
      writerLinksNeedRevision(html, [{ url: "https://firm.example", label: "our firm" }], source),
      true,
    );
  });

  it("triggers on grafted partial multi-word labels", () => {
    const source = "Thoughtfully chosen firm elements for your project. ".repeat(20);
    const html =
      '<p>Thoughtfully chosen <a href="https://firm.example">our firm</a> elements for your project.</p>';
    assert.equal(
      writerLinksNeedRevision(html, [{ url: "https://firm.example", label: "our firm" }], source),
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

describe("resolveComposeResearchedAtIso", () => {
  it("prefers compose_researched_at when set", () => {
    const researched = new Date("2026-05-27T10:00:00Z");
    const iso = resolveComposeResearchedAtIso({
      compose_researched_at: researched,
      source_text: "Brief",
      updated_at: new Date("2026-05-27T12:00:00Z"),
    });
    assert.equal(iso, researched.toISOString());
  });

  it("falls back to updated_at when brief exists without explicit timestamp", () => {
    const updated = new Date("2026-05-27T12:00:00Z");
    const iso = resolveComposeResearchedAtIso({
      source_text: "Legacy brief",
      updated_at: updated,
    });
    assert.equal(iso, updated.toISOString());
  });
});

describe("resolveComposeWrittenAtIso", () => {
  it("prefers compose_written_at when set", () => {
    const written = new Date("2026-05-27T11:00:00Z");
    const iso = resolveComposeWrittenAtIso({
      compose_written_at: written,
      generated_html: "<p>Draft</p>",
      updated_at: new Date("2026-05-27T12:00:00Z"),
    });
    assert.equal(iso, written.toISOString());
  });

  it("falls back to updated_at when HTML exists without explicit timestamp", () => {
    const updated = new Date("2026-05-27T12:00:00Z");
    const iso = resolveComposeWrittenAtIso({
      generated_html: "<p>Legacy draft</p>",
      updated_at: updated,
    });
    assert.equal(iso, updated.toISOString());
  });
});
