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

  it("includes procedural rules when facts are procedural", () => {
    const prompt = buildReconstructionSystemPrompt({
      voice: {} as Voice,
      ctx: minimalCtx(),
      facts: contentFactsSchema.parse({
        contentType: "procedural",
        sections: [
          {
            title: "Outlook 2016",
            steps: ["Open File > Options > Mail"],
          },
        ],
        keyDetails: [],
      }),
      interpretation: brandInterpretationSchema.parse({
        assessment: "Useful guide",
        qualityScore: 8,
        bestFor: "Outlook users",
        risks: [],
        caveats: [],
        opportunities: [],
      }),
      examples: [],
      links: [],
    });

    assert.match(prompt, /Procedural instructions \(strict\)/i);
    assert.match(prompt, /Do NOT merge version-specific sections/i);
  });

  it("includes hybrid rules when facts are hybrid", () => {
    const prompt = buildReconstructionSystemPrompt({
      voice: {} as Voice,
      ctx: minimalCtx(),
      facts: contentFactsSchema.parse({
        contentType: "hybrid",
        narrativeSections: [
          {
            title: "Why Your Outlook Signature Matters",
            points: ["Reinforces brand"],
          },
        ],
        sections: [
          {
            title: "Outlook for Windows",
            steps: ["Open File > Options"],
          },
        ],
        keyDetails: [],
      }),
      interpretation: brandInterpretationSchema.parse({
        assessment: "Useful guide",
        qualityScore: 8,
        bestFor: "Outlook users",
        risks: [],
        caveats: [],
        opportunities: [],
      }),
      examples: [],
      links: [],
    });

    assert.match(prompt, /Hybrid article \(full article, not a cheat sheet\)/i);
    assert.match(prompt, /Section order is flexible/i);
    assert.match(prompt, /Procedural instructions \(strict\)/i);
  });

  it("includes topic-first compose rules while keeping voice style lines", () => {
    const prompt = buildReconstructionSystemPrompt({
      voice: {} as Voice,
      ctx: minimalCtx({ brandName: "Frugal Gambler", brandMentionLevel: 50 }),
      facts: contentFactsSchema.parse({
        contentType: "hybrid",
        narrativeSections: [{ title: "Key facts", points: ["Winnings are taxable"] }],
        keyDetails: ["Federal tax applies"],
      }),
      interpretation: brandInterpretationSchema.parse({
        assessment: "Authoritative overview",
        qualityScore: 8,
        bestFor: "online gamblers",
        risks: [],
        caveats: [],
        opportunities: [],
      }),
      examples: [],
      links: [],
      composeMode: true,
      topic: "Tax implications of online casino winnings",
    });

    assert.match(prompt, /Article subject: Tax implications of online casino winnings/);
    assert.match(prompt, /do not make the brand, community, or content strategy the subject/i);
    assert.match(prompt, /Mention "Frugal Gambler" at least once when it fits naturally/);
    assert.doesNotMatch(prompt, /Include the brand's viewpoint and caveats where relevant/);
  });
});
