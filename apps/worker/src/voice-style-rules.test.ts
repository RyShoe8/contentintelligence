import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVoiceStylePromptLines,
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

describe("buildVoiceStylePromptLines", () => {
  it("always includes global taboos", () => {
    const lines = buildVoiceStylePromptLines({});
    for (const taboo of GLOBAL_VOICE_TABOOS) {
      assert.ok(lines.some((l) => l.includes(taboo)));
    }
  });

  it("includes brand name when provided", () => {
    const lines = buildVoiceStylePromptLines({ brandName: "Spinfinite" });
    assert.ok(lines.some((l) => l.includes("Spinfinite")));
  });

  it("includes preferred phrase instruction when provided", () => {
    const lines = buildVoiceStylePromptLines({
      preferredPhrases: ["Grab it while it lasts"],
    });
    assert.ok(lines.some((l) => l.includes("Grab it while it lasts")));
  });
});

describe("mergeTaboosWithGlobal", () => {
  it("dedupes case-insensitively and appends global taboos", () => {
    const merged = mergeTaboosWithGlobal(["No emojis", "avoid hype"]);
    assert.deepEqual(merged.slice(0, 2), ["No emojis", "avoid hype"]);
    assert.ok(merged.some((t) => t.toLowerCase().includes("em dash")));
  });
});
