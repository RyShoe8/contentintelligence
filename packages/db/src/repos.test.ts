import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signalItemFeedProjectStage } from "./repos.js";
import { signalItemFeedRowSchema } from "./schemas.js";

describe("signalItemFeedProjectStage", () => {
  it("excludes raw_content and email_html_preview", () => {
    const project = signalItemFeedProjectStage.$project as Record<string, unknown>;
    assert.equal(project.raw_content, 0);
    assert.equal(project.email_html_preview, 0);
    assert.ok(project.email_images);
  });
});

describe("signalItemFeedRowSchema", () => {
  it("parses feed rows without raw_content or image base64", () => {
    const row = signalItemFeedRowSchema.parse({
      id: "631fd55f-d944-4b51-8f96-97742f545d3e",
      organization_id: "631fd55f-d944-4b51-8f96-97742f545d3f",
      content_signal_id: "631fd55f-d944-4b51-8f96-97742f545d3a",
      source_id: "631fd55f-d944-4b51-8f96-97742f545d3b",
      source_type: "email_gmail",
      source_name: "Casinos",
      sender_from: "test@example.com",
      title: "Test deal",
      extracted_text: "Preview text",
      detected_keywords: [],
      relevance_score: 8,
      external_id: "gmail:abc",
      created_at: new Date("2026-06-01T00:00:00Z"),
      email_images: [{ mime: "image/png", filename: "deal.png" }],
    });

    assert.equal(row.title, "Test deal");
    assert.equal("raw_content" in row, false);
    assert.equal(row.email_images?.[0]?.mime, "image/png");
    assert.equal("data_base64" in (row.email_images?.[0] ?? {}), false);
  });
});
