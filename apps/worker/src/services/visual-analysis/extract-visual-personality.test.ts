import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visualPersonalitySchema } from "@content-resourcer/db";
import { coerceLlmString } from "../llm/coerce-llm-field.js";

/** Mirrors post-LLM mapping in extractVisualPersonality. */
function mapVisualJson(parsed: {
  visualTone?: string | string[];
  typographyStyle?: string | string[];
  memeCompatibility?: string | string[];
  colorProfile?: { contrastLevel?: string | string[] };
}) {
  return visualPersonalitySchema.parse({
    visualTone: coerceLlmString(parsed.visualTone),
    compositionStyle: [],
    colorProfile: {
      dominantColors: [],
      contrastLevel: coerceLlmString(parsed.colorProfile?.contrastLevel),
      saturationLevel: "",
      lightingMood: "",
    },
    textureStyle: [],
    typographyStyle: coerceLlmString(parsed.typographyStyle),
    layoutBehavior: [],
    memeCompatibility: coerceLlmString(parsed.memeCompatibility),
    visualTaboos: [],
    visualArchetypes: [],
    recurringMotifs: [],
  });
}

describe("extract visual personality mapping", () => {
  it("coerces array typographyStyle without throwing", () => {
    const visual = mapVisualJson({
      visualTone: ["bold", "playful"],
      typographyStyle: ["sans", "bold"],
      memeCompatibility: "medium",
      colorProfile: { contrastLevel: ["high", "vivid"] },
    });
    assert.equal(visual.typographyStyle, "sans; bold");
    assert.equal(visual.visualTone, "bold; playful");
    assert.equal(visual.colorProfile.contrastLevel, "high; vivid");
  });
});
