import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brandInterpretationSchema,
  contentFactsSchema,
} from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import { buildReconstructionSystemPrompt } from "./reconstruction.js";
import type { VoiceGenerationContext } from "../../voice-generation-context.js";

function minimalCtx(overrides: Partial<VoiceGenerationContext> = {}): VoiceGenerationContext {
  return {
    brandName: "Test Brand",
    brandMentionLevel: 50,
    sourcesInPostsLevel: 0,
    preferredPhrases: [],
    persona: "Direct and skeptical.",
    constraints: undefined,
    ...overrides,
  };
}

describe("buildReconstructionSystemPrompt", () => {
  it("includes facts-only reconstruction rules and blacklist", () => {
    const voice = {
      brand_profile: {
        memory: {
          favoriteOpenings: ["Here's the deal"],
          favoriteClosings: [],
          favoriteTransitions: [],
          recurringOpinions: [],
          recurringWarnings: [],
        },
      },
    } as Voice;

    const prompt = buildReconstructionSystemPrompt({
      voice,
      ctx: minimalCtx(),
      facts: contentFactsSchema.parse({ keyDetails: ["Fact one"] }),
      interpretation: brandInterpretationSchema.parse({
        assessment: "Worth a look",
        qualityScore: 7,
        bestFor: "casual players",
        risks: [],
        caveats: [],
        opportunities: [],
      }),
      examples: [{ title: "Prior", html: "<p>Example</p>" }],
      links: [{ url: "https://example.com/deal" }],
    });

    assert.match(prompt, /never saw the original wording/i);
    assert.match(prompt, /Human fingerprints/i);
    assert.match(prompt, /Here's the deal/);
  });
});
