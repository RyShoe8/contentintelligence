import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseWriterLinks,
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
