import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSocialPlatform,
  normalizeDistributionPlatforms,
  normalizeSocialCopyByPlatform,
  primarySocialCopy,
  socialCopyByPlatformFromDoc,
  truncateForPlatform,
} from "./social-platforms.js";
import { postSchema, voiceSchema } from "./schemas.js";

describe("normalizeDistributionPlatforms", () => {
  it("dedupes and filters invalid ids", () => {
    const out = normalizeDistributionPlatforms(["twitter", "nope", "twitter", "instagram"]);
    assert.deepEqual(out, ["twitter", "instagram"]);
  });
});

describe("getSocialPlatform", () => {
  it("returns twitter limits", () => {
    const p = getSocialPlatform("twitter");
    assert.equal(p.maxChars, 280);
    assert.match(p.label, /Twitter/i);
  });
});

describe("primarySocialCopy", () => {
  it("prefers first platform in order", () => {
    const copy = primarySocialCopy(
      { instagram: "ig", twitter: "tw" },
      "legacy",
      ["twitter", "instagram"],
    );
    assert.equal(copy, "tw");
  });
});

describe("socialCopyByPlatformFromDoc", () => {
  it("maps legacy social_copy to twitter", () => {
    const map = socialCopyByPlatformFromDoc({}, "Hello legacy");
    assert.equal(map.twitter, "Hello legacy");
  });
});

describe("truncateForPlatform", () => {
  it("truncates over limit", () => {
    const long = "a".repeat(300);
    const out = truncateForPlatform(long, "twitter");
    assert.equal(out.length, 280);
  });
});

describe("postSchema social_copy_by_platform", () => {
  it("parses legacy post with only social_copy", () => {
    const parsed = postSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      organization_id: "00000000-0000-4000-8000-000000000002",
      content_signal_id: "00000000-0000-4000-8000-000000000003",
      signal_item_id: "00000000-0000-4000-8000-000000000004",
      deal_key: "k1",
      source: "auto",
      title: "T",
      social_copy: "Legacy copy",
      deal_metrics: {
        you_pay: 10,
        baseline_value: 20,
        mode: "pay_vs_credited_value",
        confidence: 0.5,
        effective_savings_pct: 0.5,
        bonus_pct: 0,
        units_comparable: true,
        source: "regex",
      },
      source_name: "Email",
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.social_copy, "Legacy copy");
      assert.equal(parsed.data.social_copy_by_platform.twitter, "Legacy copy");
    }
  });
});

describe("voiceSchema distribution_platforms", () => {
  it("parses platform array on voice", () => {
    const parsed = voiceSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      organization_id: "00000000-0000-4000-8000-000000000002",
      name: "Brand",
      created_by: "a@b.com",
      distribution_platforms: ["linkedin", "twitter"],
      created_at: new Date(),
      updated_at: new Date(),
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(parsed.data.distribution_platforms, ["linkedin", "twitter"]);
    }
  });
});
