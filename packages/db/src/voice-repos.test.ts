import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceSchema } from "./schemas.js";

describe("voiceSchema", () => {
  it("caps keywords at five", () => {
    const parsed = voiceSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: "22222222-2222-2222-2222-222222222222",
      name: "Brand",
      keywords: ["a", "b", "c", "d", "e", "f", "g"],
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.keywords.length, 5);
    assert.deepEqual(parsed.keywords, ["a", "b", "c", "d", "e"]);
  });

  it("allows empty https URLs", () => {
    const parsed = voiceSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: "22222222-2222-2222-2222-222222222222",
      name: "Brand",
      website_url: "",
      rss_feed_url: "",
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.website_url, "");
    assert.equal(parsed.rss_feed_url, "");
  });

  it("accepts null persona_error from Mongo-shaped docs", () => {
    const parsed = voiceSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: "22222222-2222-2222-2222-222222222222",
      name: "Brand",
      persona_error: null,
      created_by: "user@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.persona_error, undefined);
  });
});
