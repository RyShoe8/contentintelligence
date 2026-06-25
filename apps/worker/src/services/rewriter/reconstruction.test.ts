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
    assert.match(prompt, /full brand voice \(perspective, rhetorical patterns, fingerprints\)/i);
    assert.match(prompt, /do not make the brand, community, or content strategy the subject/i);
    assert.match(prompt, /Apply full brand voice/);
    assert.match(prompt, /Mention "Frugal Gambler" at least once when it fits naturally/);
    assert.match(prompt, /Compose article \(author-first editorial voice — not a research summary\)/i);
    assert.match(prompt, /Do NOT use research-brief section titles as headings/i);
  });

  it("requires structured FAQ HTML in compose mode when includeFaq is true", () => {
    const prompt = buildReconstructionSystemPrompt({
      voice: {} as Voice,
      ctx: minimalCtx(),
      facts: contentFactsSchema.parse({
        contentType: "hybrid",
        narrativeSections: [{ title: "FAQ", points: ["Q: Who pays? A: The player."] }],
        keyDetails: [],
      }),
      interpretation: brandInterpretationSchema.parse({
        assessment: "Useful",
        qualityScore: 8,
        bestFor: "readers",
        risks: [],
        caveats: [],
        opportunities: [],
      }),
      examples: [],
      links: [],
      composeMode: true,
      topic: "Tax implications of online casino winnings",
      includeFaq: true,
    });

    assert.match(prompt, /FAQ section \(required — editorial format/);
    assert.match(prompt, /Forbidden FAQ H2 titles: "Your Questions Answered"/);
    assert.match(prompt, /<h3>Question\?<\/h3><p>Answer/);
  });

  it("forbids FAQ section in compose mode when includeFaq is false", () => {
    const prompt = buildReconstructionSystemPrompt({
      voice: {} as Voice,
      ctx: minimalCtx(),
      facts: contentFactsSchema.parse({
        contentType: "hybrid",
        narrativeSections: [{ title: "Key facts", points: ["Fact"] }],
        keyDetails: [],
      }),
      interpretation: brandInterpretationSchema.parse({
        assessment: "Useful",
        qualityScore: 8,
        bestFor: "readers",
        risks: [],
        caveats: [],
        opportunities: [],
      }),
      examples: [],
      links: [],
      composeMode: true,
      topic: "Tax implications of online casino winnings",
      includeFaq: false,
    });

    assert.match(prompt, /Do not include an FAQ, frequently asked questions, or Q&A section/);
  });

  it("includes compose voice rhythm rules and inline link constraints", () => {
    const prompt = buildReconstructionSystemPrompt({
      voice: {} as Voice,
      ctx: minimalCtx(),
      facts: contentFactsSchema.parse({
        contentType: "hybrid",
        narrativeSections: [{ title: "Key facts", points: ["Fact"] }],
        keyDetails: ["Detail"],
      }),
      interpretation: brandInterpretationSchema.parse({
        assessment: "Useful",
        qualityScore: 8,
        bestFor: "readers",
        risks: [],
        caveats: [],
        opportunities: [],
      }),
      examples: [],
      links: [{ url: "https://example.com/team", label: "our team" }],
      composeMode: true,
      topic: "Senior living design guidelines",
    });

    assert.match(prompt, /Short paragraphs \(often 1–3 sentences\)/);
    assert.match(prompt, /Do NOT add a "Related links" section/);
    assert.match(prompt, /not in the final paragraph/i);
  });

  it("includes compose how-to rules when compose mode has procedural sections", () => {
    const prompt = buildReconstructionSystemPrompt({
      voice: {} as Voice,
      ctx: minimalCtx(),
      facts: contentFactsSchema.parse({
        contentType: "hybrid",
        narrativeSections: [{ title: "Why signatures matter", points: ["Brand consistency"] }],
        sections: [
          {
            title: "Apple Mail",
            steps: ["Open Mail > Settings > Signatures", "Drag the HTML file into the preview"],
          },
        ],
        keyDetails: ["Apple Mail supports HTML signatures"],
      }),
      interpretation: brandInterpretationSchema.parse({
        assessment: "Useful guide",
        qualityScore: 8,
        bestFor: "Apple Mail users",
        risks: [],
        caveats: [],
        opportunities: [],
      }),
      examples: [],
      links: [],
      composeMode: true,
      topic: "How to setup your email signature in Apple Mail",
      subtopics: ["Import a custom HTML signature file"],
    });

    assert.match(prompt, /Compose how-to article \(tutorial in brand voice/i);
    assert.match(prompt, /how-to tutorial ABOUT this topic/i);
    assert.match(prompt, /Import a custom HTML signature file/);
    assert.match(prompt, /Do NOT generalize to "email clients"/i);
    assert.doesNotMatch(prompt, /author-first editorial voice — not a research summary/i);
  });
});
