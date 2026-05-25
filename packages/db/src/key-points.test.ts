import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandKeyPoints,
  normalizeKeyPointsFromRaw,
  splitCompoundKeyPointText,
} from "./key-points.js";
import { signalItemSchema } from "./schemas.js";

describe("splitCompoundKeyPointText", () => {
  it("splits semicolon-separated facts", () => {
    const parts = splitCompoundKeyPointText("Claim by May 1; Valid in all states");
    assert.equal(parts.length, 2);
    assert.match(parts[0]!, /Claim by May 1/i);
    assert.match(parts[1]!, /Valid in all states/i);
  });
});

describe("normalizeKeyPointsFromRaw", () => {
  it("migrates legacy string array", () => {
    const out = normalizeKeyPointsFromRaw(["Claim by Friday", "Void where prohibited"]);
    assert.equal(out.length, 2);
    assert.equal(out[0]!.category, "other");
    assert.equal(out[0]!.text, "Claim by Friday");
  });

  it("accepts structured objects", () => {
    const out = normalizeKeyPointsFromRaw([
      { category: "deadline", text: "Runs through June 30" },
      { category: "invalid_cat", text: "ignored category becomes other" },
    ]);
    assert.equal(out[0]!.category, "deadline");
    assert.equal(out[1]!.category, "other");
  });

  it("expands compound legacy strings", () => {
    const out = normalizeKeyPointsFromRaw([
      { category: "other", text: "Claim by May 1; Valid in all states" },
    ]);
    assert.equal(out.length, 2);
  });
});

describe("expandKeyPoints", () => {
  it("dedupes identical category+text", () => {
    const out = expandKeyPoints([
      { category: "offer", text: "50% bonus" },
      { category: "offer", text: "50% bonus" },
    ]);
    assert.equal(out.length, 1);
  });
});

describe("signalItemSchema key_points", () => {
  it("parses legacy strings on signal item", () => {
    const parsed = signalItemSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      organization_id: "00000000-0000-4000-8000-000000000002",
      content_signal_id: "00000000-0000-4000-8000-000000000003",
      source_id: "00000000-0000-4000-8000-000000000004",
      source_type: "email_gmail",
      source_name: "Email",
      sender_from: "a@b.com",
      title: "T",
      raw_content: "x",
      extracted_text: "y",
      relevance_score: 5,
      external_id: "ext",
      key_points: ["Point one"],
      created_at: new Date(),
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.key_points[0]!.text, "Point one");
      assert.equal(parsed.data.key_points[0]!.category, "other");
    }
  });
});
