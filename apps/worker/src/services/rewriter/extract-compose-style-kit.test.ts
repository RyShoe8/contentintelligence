import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractComposeStyleKitDeterministic,
  summarizeComposeStyleKits,
} from "./extract-compose-style-kit.js";

const SBD_CHAIR_FIXTURE = `
<h2>We sit in every chair</h2>
<p>We never specify seating we have not tested ourselves.</p>
<p>That rule sounds simple. We take it seriously.</p>
<p>When we partner with communities, we bring that same standard to every room.</p>
<h2>What we look for</h2>
<p>Comfort matters, but durability matters more. We watch how residents move.</p>
<p>We reject chairs that look fine in a catalog but fail after six months of daily use.</p>
`;

describe("extractComposeStyleKitDeterministic", () => {
  it("extracts headings, opening paragraphs, and signature we-voice lines", () => {
    const kit = extractComposeStyleKitDeterministic(SBD_CHAIR_FIXTURE);
    assert.ok(kit.headings.some((h) => /sit in every chair/i.test(h)));
    assert.ok(kit.openingParagraphs.length >= 2);
    assert.ok(
      kit.signatureParagraphs.some((p) => /never specify seating/i.test(p)),
    );
  });

  it("summarizeComposeStyleKits produces compact prompt block", () => {
    const kit = extractComposeStyleKitDeterministic(SBD_CHAIR_FIXTURE);
    const summary = summarizeComposeStyleKits([kit]);
    assert.ok(summary?.includes("Example 1"));
    assert.ok(summary?.includes("Headings:"));
  });
});
