import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWriterComposeStatus } from "./writer-repos.js";
import {
  sanitizeComposeStyleKitForStorage,
  writerArticleSchema,
} from "./schemas.js";

const minimalWriterDoc = {
  id: "00000000-0000-4000-8000-000000000001",
  organization_id: "00000000-0000-4000-8000-000000000002",
  voice_id: "00000000-0000-4000-8000-000000000003",
  title: "Test article",
  source_text: "Source body text for the writer article.",
  links: [],
  generated_html: "<p>Draft</p>",
  status: "draft" as const,
  created_by: "user@example.com",
  created_at: new Date("2026-05-27T12:00:00Z"),
  updated_at: new Date("2026-05-27T12:00:00Z"),
};

describe("writerArticleSchema", () => {
  it("coerces null final_html to undefined", () => {
    const parsed = writerArticleSchema.parse({
      ...minimalWriterDoc,
      final_html: null,
    });
    assert.equal(parsed.final_html, undefined);
  });

  it("coerces empty string final_html to undefined", () => {
    const parsed = writerArticleSchema.parse({
      ...minimalWriterDoc,
      final_html: "",
    });
    assert.equal(parsed.final_html, undefined);
  });

  it("preserves non-empty final_html", () => {
    const parsed = writerArticleSchema.parse({
      ...minimalWriterDoc,
      final_html: "<p>Saved</p>",
    });
    assert.equal(parsed.final_html, "<p>Saved</p>");
  });

  it("accepts compose job status fields", () => {
    const parsed = writerArticleSchema.parse({
      ...minimalWriterDoc,
      mode: "compose",
      topic: "Topic with enough characters",
      compose_status: "pending",
      compose_requested_at: new Date("2026-05-27T12:00:00Z"),
    });
    assert.equal(parsed.compose_status, "pending");
    assert.equal(parsed.mode, "compose");
  });

  it("accepts compose_phase on compose articles", () => {
    const parsed = writerArticleSchema.parse({
      ...minimalWriterDoc,
      mode: "compose",
      topic: "Topic with enough characters",
      compose_status: "pending",
      compose_phase: "write_only",
      compose_requested_at: new Date("2026-05-27T12:00:00Z"),
    });
    assert.equal(parsed.compose_phase, "write_only");
  });

  it("coerces null compose_error and compose_meta to undefined", () => {
    const parsed = writerArticleSchema.parse({
      ...minimalWriterDoc,
      mode: "compose",
      topic: "Topic with enough characters",
      compose_status: "pending",
      compose_error: null,
      compose_meta: null,
      compose_requested_at: null,
    });
    assert.equal(parsed.compose_error, undefined);
    assert.equal(parsed.compose_meta, undefined);
    assert.equal(parsed.compose_requested_at, undefined);
  });

  it("coerces null compose_style_kit.rhythmSample to undefined on style_example docs", () => {
    const parsed = writerArticleSchema.parse({
      ...minimalWriterDoc,
      mode: "style_example",
      status: "saved",
      generated_html: "",
      final_html: "<h2>We sit in every chair</h2><p>Editorial body copy.</p>".repeat(8),
      source_text: "",
      compose_style_kit: {
        headings: ["We sit in every chair"],
        openingParagraphs: [],
        signatureParagraphs: [],
        rhythmSample: null,
        archetype: {
          sectionCount: 2,
          sampleHeadings: ["We sit in every chair", "What we look for"],
          openingPattern: null,
          singleThreaded: true,
        },
      },
    });
    assert.equal(parsed.compose_style_kit?.rhythmSample, undefined);
    assert.equal(parsed.compose_style_kit?.archetype?.openingPattern, undefined);
  });

  it("sanitizeComposeStyleKitForStorage omits null rhythmSample before write", () => {
    const kit = sanitizeComposeStyleKitForStorage({
      headings: ["Opening"],
      openingParagraphs: [],
      signatureParagraphs: [],
      concreteDetails: [],
      rhythmSample: null as unknown as string,
    });
    assert.equal(kit.rhythmSample, undefined);
    assert.ok(!("rhythmSample" in kit));
  });
});

describe("resolveWriterComposeStatus", () => {
  it("returns explicit compose_status when set", () => {
    const article = writerArticleSchema.parse({
      ...minimalWriterDoc,
      mode: "compose",
      topic: "Topic with enough characters",
      compose_status: "failed",
      compose_error: "timeout",
    });
    assert.equal(resolveWriterComposeStatus(article), "failed");
  });

  it("treats legacy compose articles with html as ready", () => {
    const article = writerArticleSchema.parse({
      ...minimalWriterDoc,
      mode: "compose",
      topic: "Topic with enough characters",
    });
    assert.equal(resolveWriterComposeStatus(article), "ready");
  });

  it("returns undefined for rewrite mode", () => {
    const article = writerArticleSchema.parse({
      ...minimalWriterDoc,
      mode: "rewrite",
      reference_urls: [],
    });
    assert.equal(resolveWriterComposeStatus(article), undefined);
  });

  it("parses style_example mode", () => {
    const parsed = writerArticleSchema.parse({
      ...minimalWriterDoc,
      mode: "style_example",
      status: "saved",
      generated_html: "",
      final_html: "<p>Human blog copy for style matching.</p>".repeat(8),
      source_text: "",
    });
    assert.equal(parsed.mode, "style_example");
    assert.equal(resolveWriterComposeStatus(parsed), undefined);
  });
});
