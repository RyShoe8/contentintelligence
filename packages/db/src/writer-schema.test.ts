import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writerArticleSchema } from "./schemas.js";

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
});
