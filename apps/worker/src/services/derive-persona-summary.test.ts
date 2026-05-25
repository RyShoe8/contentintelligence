import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyBrandProfile } from "@content-resourcer/db";
import { derivePersonaSummary } from "./derive-persona-summary.js";

describe("derivePersonaSummary", () => {
  const profile = emptyBrandProfile();
  profile.positioning.primary = "Bold promo voice";

  it("omits voice settings sections when opts are not provided", () => {
    const summary = derivePersonaSummary(profile, "Spinfinite");
    assert.match(summary, /# Spinfinite voice/);
    assert.match(summary, /## Voice summary/);
    assert.doesNotMatch(summary, /## Brand mention frequency/);
    assert.doesNotMatch(summary, /## Preferred phrases for posts/);
  });

  it("includes default brand mention level with Sometimes label", () => {
    const summary = derivePersonaSummary(profile, "Spinfinite", {
      brandMentionLevel: 50,
      preferredPhrases: [],
    });
    assert.match(summary, /## Brand mention frequency/);
    assert.match(summary, /Setting: 50 \(Sometimes\)/);
    assert.match(summary, /Mention "Spinfinite" at least once when it fits naturally/);
  });

  it("renders preferred phrases with and without URLs", () => {
    const summary = derivePersonaSummary(profile, "Spinfinite", {
      brandMentionLevel: 100,
      preferredPhrases: [
        {
          phrases: ["Grab it while it lasts"],
          url: "https://example.com/promo",
          frequency_level: 50,
        },
        { phrases: ["Your daily bonus drop"], frequency_level: 50 },
      ],
    });
    assert.match(summary, /## Preferred phrases for posts/);
    assert.match(
      summary,
      /- Grab it while it lasts\|https:\/\/example.com\/promo \(Sometimes, 50, exact wording only\)/,
    );
    assert.match(summary, /- Your daily bonus drop \(Sometimes, 50, exact wording only\)/);
    assert.match(summary, /Use at most one phrase\+link pair when natural/);
  });

  it("shows None configured when preferred phrases are empty", () => {
    const summary = derivePersonaSummary(profile, "Spinfinite", {
      brandMentionLevel: 50,
      preferredPhrases: [],
    });
    assert.match(summary, /## Preferred phrases for posts/);
    assert.match(summary, /- None configured/);
  });
});
