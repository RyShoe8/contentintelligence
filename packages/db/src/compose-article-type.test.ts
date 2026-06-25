import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasEditorialResearchBriefHeaders,
  hasHowToResearchBriefHeaders,
  isComposeHowToTopic,
  resolveComposeArticleType,
} from "./compose-article-type.js";

describe("isComposeHowToTopic", () => {
  it("detects how-to phrasing in the topic", () => {
    assert.equal(
      isComposeHowToTopic("How to setup your email signature in Apple Mail"),
      true,
    );
    assert.equal(isComposeHowToTopic("Tax implications of online casino winnings"), false);
  });

  it("detects procedural subtopics", () => {
    assert.equal(
      isComposeHowToTopic("Email signature guide", ["Import a custom HTML signature file"]),
      true,
    );
    assert.equal(
      isComposeHowToTopic("Senior living design guidelines", ["Lighting and corridors"]),
      false,
    );
  });
});

describe("resolveComposeArticleType", () => {
  it("returns explicit type when provided", () => {
    assert.equal(
      resolveComposeArticleType("editorial", "How to install Node.js"),
      "editorial",
    );
    assert.equal(
      resolveComposeArticleType("how_to", "Tax policy overview"),
      "how_to",
    );
  });

  it("infers how_to from topic heuristics when unset", () => {
    assert.equal(
      resolveComposeArticleType(undefined, "How to configure Apple Mail signatures"),
      "how_to",
    );
    assert.equal(
      resolveComposeArticleType(undefined, "Senior living tax planning"),
      "editorial",
    );
  });
});

describe("research brief header detection", () => {
  it("detects editorial brief structure", () => {
    const brief = `Topic Overview:
A summary here.

Key Facts:
1. Fact one

Angles to Cover:
1. Beginner guide`;
    assert.equal(hasEditorialResearchBriefHeaders(brief), true);
    assert.equal(hasHowToResearchBriefHeaders(brief), false);
  });

  it("detects how-to brief structure", () => {
    const brief = `Setup steps:
1. Open Mail > Preferences

Per-platform/subtopic procedures:
Apple Mail steps here.

Troubleshooting:
Images may not display.`;
    assert.equal(hasHowToResearchBriefHeaders(brief), true);
    assert.equal(hasEditorialResearchBriefHeaders(brief), false);
  });
});
