import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Voice } from "@content-resourcer/db";
import {
  budgetStyleTransferInputs,
  buildStyleTransferSystemPrompt,
  shouldRunStyleTransfer,
  validateStyleTransferOutput,
} from "./style-transfer.js";

const minimalVoice = {
  id: "00000000-0000-4000-8000-000000000001",
  organization_id: "00000000-0000-4000-8000-000000000002",
  name: "Test Voice",
  persona_status: "ready",
} as Voice;

describe("shouldRunStyleTransfer", () => {
  it("returns false for missing or short reference", () => {
    assert.equal(shouldRunStyleTransfer(undefined), false);
    assert.equal(shouldRunStyleTransfer(""), false);
    assert.equal(shouldRunStyleTransfer("short"), false);
  });

  it("returns true when reference meets minimum length", () => {
    assert.equal(shouldRunStyleTransfer("x".repeat(400)), true);
  });
});

describe("budgetStyleTransferInputs", () => {
  it("returns full inputs when within budget", () => {
    const reference = "ref ".repeat(100);
    const draft = "draft ".repeat(100);
    const result = budgetStyleTransferInputs(reference, draft, 50000);
    assert.equal(result.referenceHtml, reference);
    assert.equal(result.draftHtml, draft);
  });

  it("preserves full reference and trims draft when draft is large", () => {
    const reference = "R".repeat(5000);
    const draft = "D".repeat(50000);
    const result = budgetStyleTransferInputs(reference, draft, 10000);
    assert.equal(result.referenceHtml, reference);
    assert.ok(result.draftHtml.length < draft.length);
    assert.ok(result.draftHtml.includes("…"));
  });

  it("keeps reference at least near preserve minimum when possible", () => {
    const reference = "R".repeat(12000);
    const draft = "D".repeat(40000);
    const result = budgetStyleTransferInputs(reference, draft, 20000);
    assert.ok(result.referenceHtml.length >= 8000);
    assert.ok(result.referenceHtml.length <= reference.length);
  });
});

describe("buildStyleTransferSystemPrompt", () => {
  it("includes preserve-links/facts rules and blacklist", () => {
    const prompt = buildStyleTransferSystemPrompt({
      voice: minimalVoice,
      composeMode: true,
      topic: "Senior living design",
      referenceTitle: "The SBD Chair Test",
    });
    assert.match(prompt, /Keep every existing <a href/);
    assert.match(prompt, /Preserve ALL factual claims/);
    assert.match(prompt, /Do not invent new statistics/);
    assert.match(prompt, /Do NOT copy the reference title/);
    assert.match(prompt, /Preserve topic focus on "Senior living design"/);
  });

  it("includes rhythm and concrete details when kit provided", () => {
    const prompt = buildStyleTransferSystemPrompt({
      voice: minimalVoice,
      composeStyleKit: {
        headings: [],
        openingParagraphs: [],
        signatureParagraphs: [],
        concreteDetails: ["Only 10% of chairs pass our test."],
        rhythm: { shortParagraphShare: 0.4, hasFragments: true, hasBoldLines: true },
      },
    });
    assert.match(prompt, /Brand rhythm/);
    assert.match(prompt, /Only 10% of chairs pass our test/);
  });
});

describe("validateStyleTransferOutput", () => {
  const original =
    "<h2>We test chairs</h2><p>We never specify seating we have not tested.</p>" +
    '<p>See our <a href="https://example.com/guide">design guide</a> for more.</p>';

  it("passes valid output with links preserved", () => {
    const output =
      "<h2>Every chair we specify</h2><p>We never specify seating we have not tested ourselves.</p>" +
      '<p>Read our <a href="https://example.com/guide">design guide</a>.</p>';
    const result = validateStyleTransferOutput({
      originalHtml: original,
      outputHtml: output,
      links: [{ url: "https://example.com/guide", label: "design guide" }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
  });

  it("fails when required links are dropped", () => {
    const output = "<h2>We test chairs</h2><p>We never specify seating we have not tested.</p>";
    const result = validateStyleTransferOutput({
      originalHtml: original,
      outputHtml: output,
      links: [{ url: "https://example.com/guide", label: "design guide" }],
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.includes("dropped")));
  });

  it("fails when output is empty", () => {
    const result = validateStyleTransferOutput({
      originalHtml: original,
      outputHtml: "",
    });
    assert.equal(result.ok, false);
  });
});
