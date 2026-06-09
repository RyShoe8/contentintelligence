import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStyleSourceUrlExcluded,
  normalizeStyleSourceUrl,
  writerArticleHtmlForLearning,
  writerComposeStatusPayload,
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

describe("writerComposeStatusPayload", () => {
  it("omits research fields for write_only phase", () => {
    const article = writerArticleSchema.parse({
      id: "00000000-0000-4000-8000-000000000012",
      organization_id: "00000000-0000-4000-8000-000000000020",
      voice_id: "00000000-0000-4000-8000-000000000030",
      mode: "compose",
      title: "Senior living",
      topic: "Senior living",
      reference_urls: [],
      source_text: "Brief text",
      links: [],
      generated_html: "<p>Draft</p>",
      status: "draft",
      compose_status: "ready",
      compose_phase: "write_only",
      compose_meta: {
        references_fetched: 5,
        research_mode: "deep",
        human_authenticity_score: 88,
        voice_quality_warning: "Genericity 40 exceeds max 38. Review before publishing.",
      },
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });

    const payload = writerComposeStatusPayload(article);
    assert.equal(payload.compose_phase, "write_only");
    assert.equal(payload.human_authenticity_score, 88);
    assert.match(payload.voice_quality_warning ?? "", /Genericity 40/);
    assert.equal("references_fetched" in payload, false);
    assert.equal("research_mode" in payload, false);
  });

  it("includes research fields for full compose", () => {
    const article = writerArticleSchema.parse({
      id: "00000000-0000-4000-8000-000000000013",
      organization_id: "00000000-0000-4000-8000-000000000020",
      voice_id: "00000000-0000-4000-8000-000000000030",
      mode: "compose",
      title: "Senior living",
      topic: "Senior living",
      reference_urls: [],
      source_text: "Brief text",
      links: [],
      generated_html: "<p>Draft</p>",
      status: "draft",
      compose_status: "ready",
      compose_phase: "full",
      compose_meta: {
        references_fetched: 3,
        research_mode: "standard",
      },
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });

    const payload = writerComposeStatusPayload(article);
    assert.equal(payload.compose_phase, "full");
    assert.ok("references_fetched" in payload);
    assert.ok("research_mode" in payload);
    if ("references_fetched" in payload && "research_mode" in payload) {
      assert.equal(payload.references_fetched, 3);
      assert.equal(payload.research_mode, "standard");
    }
  });
});
