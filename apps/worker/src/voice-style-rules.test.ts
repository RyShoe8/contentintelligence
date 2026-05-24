import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBrandMentionPromptLine,
  buildVoiceStylePromptLines,
  formatPreferredPhrasesForUserMessage,
  GLOBAL_VOICE_TABOOS,
  mergeTaboosWithGlobal,
  sanitizeVoicePostCopy,
} from "./voice-style-rules.js";

describe("sanitizeVoicePostCopy", () => {
  it("removes emojis", () => {
    assert.equal(sanitizeVoicePostCopy("Great deal 🔥 today"), "Great deal today");
  });

  it("replaces em and en dashes with comma", () => {
    assert.equal(sanitizeVoicePostCopy("Buy now – limited time"), "Buy now, limited time");
    assert.equal(sanitizeVoicePostCopy("Act fast — ends soon"), "Act fast, ends soon");
  });

  it("leaves ASCII hyphens in tokens", () => {
    assert.equal(sanitizeVoicePostCopy("$44 for 24/7 access"), "$44 for 24/7 access");
  });
});

describe("buildBrandMentionPromptLine", () => {
  it("maps tier 0 to never mention", () => {
    const line = buildBrandMentionPromptLine("Spinfinite", 0);
    assert.match(line ?? "", /Do not mention the brand name "Spinfinite"/);
  });

  it("maps tier 25 to rarely mention", () => {
    const line = buildBrandMentionPromptLine("Spinfinite", 25);
    assert.match(line ?? "", /rarely/);
  });

  it("maps tier 50 to sometimes mention", () => {
    const line = buildBrandMentionPromptLine("Spinfinite", 50);
    assert.match(line ?? "", /at least once when it fits naturally/);
  });

  it("maps tier 75 to often mention", () => {
    const line = buildBrandMentionPromptLine("Spinfinite", 75);
    assert.match(line ?? "", /prominently/);
  });

  it("maps tier 100 to always lead with brand", () => {
    const line = buildBrandMentionPromptLine("Spinfinite", 100);
    assert.match(line ?? "", /Always lead with "Spinfinite"/);
  });
});

describe("buildVoiceStylePromptLines", () => {
  it("always includes global taboos", () => {
    const lines = buildVoiceStylePromptLines({});
    for (const taboo of GLOBAL_VOICE_TABOOS) {
      assert.ok(lines.some((l) => l.includes(taboo)));
    }
  });

  it("includes brand line at default level", () => {
    const lines = buildVoiceStylePromptLines({ brandName: "Spinfinite" });
    assert.ok(lines.some((l) => l.includes("Spinfinite")));
  });

  it("uses never-mention line at level 0", () => {
    const lines = buildVoiceStylePromptLines({ brandName: "Spinfinite", brandMentionLevel: 0 });
    assert.ok(lines.some((l) => l.includes("Do not mention the brand name")));
  });

  it("uses lead-with line at level 100", () => {
    const lines = buildVoiceStylePromptLines({ brandName: "Spinfinite", brandMentionLevel: 100 });
    assert.ok(lines.some((l) => l.includes("Always lead with")));
  });

  it("includes phrase pair instructions when provided", () => {
    const lines = buildVoiceStylePromptLines({
      preferredPhrases: [{ phrase: "Grab it while it lasts", url: "https://example.com/promo" }],
    });
    assert.ok(lines.some((l) => l.includes("phrase+link pair")));
    assert.ok(lines.some((l) => l.includes("paired URL")));
  });
});

describe("formatPreferredPhrasesForUserMessage", () => {
  it("formats phrase with url and phrase-only rows", () => {
    const text = formatPreferredPhrasesForUserMessage([
      { phrase: "Grab it", url: "https://example.com/promo" },
      { phrase: "Daily drop" },
    ]);
    assert.match(text, /Grab it\|https:\/\/example\.com\/promo/);
    assert.match(text, /Daily drop/);
    assert.doesNotMatch(text, /Daily drop\|/);
  });
});

describe("mergeTaboosWithGlobal", () => {
  it("dedupes case-insensitively and appends global taboos", () => {
    const merged = mergeTaboosWithGlobal(["No emojis", "avoid hype"]);
    assert.deepEqual(merged.slice(0, 2), ["No emojis", "avoid hype"]);
    assert.ok(merged.some((t) => t.toLowerCase().includes("em dash")));
  });
});
