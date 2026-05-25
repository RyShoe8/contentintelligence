import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVoiceStylePromptLines,
  formatPreferredPhrasesForUserMessage,
  formatPhraseGroup,
  mergeTaboosWithGlobal,
  sanitizeVoicePostCopy,
} from "./voice-style-rules.js";

describe("formatPhraseGroup", () => {
  it("joins multiple phrases", () => {
    assert.equal(formatPhraseGroup(["Grab it", "Act now"]), '"Grab it" / "Act now"');
  });
});

describe("buildVoiceStylePromptLines", () => {
  it("includes paraphrase instruction when AI variations enabled", () => {
    const lines = buildVoiceStylePromptLines({
      brandName: "Test",
      brandMentionLevel: 50,
      preferredPhrases: [
        {
          phrases: ["Spin now", "Play today"],
          url: "https://example.com/play",
          frequency_level: 75,
          allow_ai_variations: true,
        },
      ],
    });
    assert.ok(lines.some((l) => l.includes("close paraphrases")));
    assert.ok(lines.some((l) => l.includes("Spin now")));
  });

  it("includes content provider mention line when level is above zero", () => {
    const lines = buildVoiceStylePromptLines({
      contentProviderName: "Chipnwin",
      sourcesInPostsLevel: 75,
    });
    assert.ok(lines.some((l) => l.includes("Chipnwin")));
    assert.ok(lines.some((l) => l.includes("prominently")));
    assert.ok(!lines.some((l) => l.includes("email source")));
  });

  it("instructs not to mention content provider at level zero", () => {
    const lines = buildVoiceStylePromptLines({
      contentProviderName: "Chipnwin",
      sourcesInPostsLevel: 0,
    });
    assert.ok(lines.some((l) => l.includes("Do not mention")));
    assert.ok(lines.some((l) => l.includes("Chipnwin")));
  });

  it("requires exact wording when AI variations disabled", () => {
    const lines = buildVoiceStylePromptLines({
      preferredPhrases: [
        {
          phrases: ["Grab it"],
          frequency_level: 50,
          allow_ai_variations: false,
        },
      ],
    });
    assert.ok(lines.some((l) => l.includes("exact wording")));
    assert.ok(!lines.some((l) => l.includes("close paraphrases")));
  });
});

describe("formatPreferredPhrasesForUserMessage", () => {
  it("formats phrase group with url and frequency labels", () => {
    const text = formatPreferredPhrasesForUserMessage([
      {
        phrases: ["Grab it", "Act now"],
        url: "https://example.com/promo",
        frequency_level: 75,
        allow_ai_variations: true,
      },
      { phrases: ["Daily drop"], frequency_level: 50, allow_ai_variations: false },
    ]);
    assert.match(text, /Grab it.*Act now.*\(Often, 75, variations allowed\)/);
    assert.match(text, /https:\/\/example\.com\/promo/);
    assert.match(text, /Daily drop \(Sometimes, 50, exact wording only\)/);
  });

  it("omits groups with frequency 0", () => {
    const text = formatPreferredPhrasesForUserMessage([
      { phrases: ["Skip me"], frequency_level: 0 },
      { phrases: ["Keep me"], frequency_level: 50 },
    ]);
    assert.doesNotMatch(text, /Skip me/);
    assert.match(text, /Keep me/);
  });
});

describe("sanitizeVoicePostCopy", () => {
  it("removes emojis", () => {
    const out = sanitizeVoicePostCopy("Hello 🎰 world");
    assert.ok(!out.includes("🎰"));
    assert.match(out, /Hello\s+world/);
  });
});

describe("mergeTaboosWithGlobal", () => {
  it("dedupes case-insensitively and appends global taboos", () => {
    const merged = mergeTaboosWithGlobal(["No emojis", "avoid hype"]);
    assert.deepEqual(merged.slice(0, 2), ["No emojis", "avoid hype"]);
    assert.ok(merged.some((t) => t.toLowerCase().includes("em dash")));
  });
});
