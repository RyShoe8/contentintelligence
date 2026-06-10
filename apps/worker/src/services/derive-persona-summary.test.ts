import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyBrandProfile } from "@content-resourcer/db";
import { derivePersonaSummary, deriveWriterPersonaSummary } from "./derive-persona-summary.js";

describe("derivePersonaSummary", () => {
  const profile = emptyBrandProfile();
  profile.positioning.primary = "Bold promo voice";

  it("omits voice settings and visual sections in default writer mode", () => {
    const summary = derivePersonaSummary(profile, "Senior By Design");
    assert.match(summary, /# Senior By Design voice/);
    assert.match(summary, /## Voice summary/);
    assert.doesNotMatch(summary, /## Brand mention frequency/);
    assert.doesNotMatch(summary, /## Preferred phrases for posts/);
    assert.doesNotMatch(summary, /## Content provider names in posts/);
    assert.doesNotMatch(summary, /## Visual identity/);
    assert.doesNotMatch(summary, /casino/);
  });

  it("includes social post settings only when includeSocialPostSettings is true", () => {
    const summary = derivePersonaSummary(profile, "Spinfinite", {
      includeSocialPostSettings: true,
      voiceOpts: {
        brandMentionLevel: 50,
        preferredPhrases: [],
      },
    });
    assert.match(summary, /## Brand mention frequency/);
    assert.match(summary, /Setting: 50 \(Sometimes\)/);
    assert.match(summary, /## Content provider names in posts/);
    assert.match(summary, /casino/);
    assert.match(summary, /## Preferred phrases for posts/);
  });

  it("includes visual identity only when includeVisualIdentity is true", () => {
    profile.visualPersonality.visualTone = "Playful and warm";
    const summary = derivePersonaSummary(profile, "Spinfinite", {
      includeVisualIdentity: true,
    });
    assert.match(summary, /## Visual identity/);
    assert.match(summary, /Visual tone: Playful and warm/);
  });

  it("renders preferred phrases with and without URLs in social mode", () => {
    const summary = derivePersonaSummary(profile, "Spinfinite", {
      includeSocialPostSettings: true,
      voiceOpts: {
        brandMentionLevel: 100,
        preferredPhrases: [
          {
            phrases: ["Grab it while it lasts"],
            url: "https://example.com/promo",
            frequency_level: 50,
          },
          { phrases: ["Your daily bonus drop"], frequency_level: 50 },
        ],
      },
    });
    assert.match(summary, /## Preferred phrases for posts/);
    assert.match(
      summary,
      /- Grab it while it lasts\|https:\/\/example.com\/promo \(Sometimes, 50, exact wording only\)/,
    );
  });

  it("appends compose editorial block in writer mode", () => {
    const summary = deriveWriterPersonaSummary(
      profile,
      "Senior By Design",
      "- Single editorial thread\n- Conviction opening",
    );
    assert.match(summary, /## Editorial compose/);
    assert.match(summary, /Single editorial thread/);
    assert.doesNotMatch(summary, /casino/);
  });
});
