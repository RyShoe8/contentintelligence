import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStyleSourceUrlExcluded,
  normalizeStyleSourceUrl,
  writerArticleHtmlForLearning,
} from "./writer-repos.js";
import { writerArticleSchema } from "./schemas.js";

describe("writer style example records", () => {
  it("stores imported blog HTML in final_html for learning", () => {
    const html = "<p>We never specify a chair we have not personally sat in.</p>".repeat(4);
    const article = writerArticleSchema.parse({
      id: "00000000-0000-4000-8000-000000000010",
      organization_id: "00000000-0000-4000-8000-000000000020",
      voice_id: "00000000-0000-4000-8000-000000000030",
      mode: "style_example",
      title: "The SBD Chair Test",
      source_text: "",
      links: [],
      generated_html: "",
      final_html: html,
      status: "saved",
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });

    assert.equal(writerArticleHtmlForLearning(article), html);
  });
});

describe("normalizeStyleSourceUrl", () => {
  it("normalizes https URLs and strips trailing slash", () => {
    assert.equal(
      normalizeStyleSourceUrl("https://example.com/post/"),
      "https://example.com/post",
    );
  });

  it("rejects non-https URLs", () => {
    assert.equal(normalizeStyleSourceUrl("http://example.com/post"), null);
  });
});

describe("isStyleSourceUrlExcluded", () => {
  it("matches excluded URLs case-insensitively on path", () => {
    assert.equal(
      isStyleSourceUrlExcluded("https://example.com/post/", [
        "https://example.com/post",
      ]),
      true,
    );
    assert.equal(
      isStyleSourceUrlExcluded("https://example.com/other", [
        "https://example.com/post",
      ]),
      false,
    );
  });
});

describe("upsertWriterComposePending generated_html", () => {
  it("preserves generated_html when entering pending on re-queue", () => {
    const priorHtml = "<p>Prior draft until new generation completes.</p>";
    const row = writerArticleSchema.parse({
      id: "00000000-0000-4000-8000-000000000011",
      organization_id: "00000000-0000-4000-8000-000000000020",
      voice_id: "00000000-0000-4000-8000-000000000030",
      mode: "compose",
      title: "Senior living design",
      topic: "Senior living design",
      reference_urls: [],
      source_text: "Research brief kept for write-only.",
      links: [],
      generated_html: priorHtml,
      status: "draft",
      compose_status: "pending",
      compose_requested_at: new Date(),
      compose_phase: "write_only",
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(row.generated_html, priorHtml);
    assert.match(row.source_text, /Research brief/);
  });
});
