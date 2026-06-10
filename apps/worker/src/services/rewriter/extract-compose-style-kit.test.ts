import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractComposeStyleKitDeterministic,
  extractConcreteDetails,
  extractRhythmMetrics,
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

  it("persists compose archetype on deterministic kit extract", () => {
    const kit = extractComposeStyleKitDeterministic(SBD_CHAIR_FIXTURE);
    assert.ok(kit.archetype);
    assert.equal(kit.archetype?.sectionCount, 2);
    assert.ok(kit.archetype?.sampleHeadings.some((h) => /sit in every chair/i.test(h)));
    assert.equal(kit.archetype?.singleThreaded, true);
  });
});

const CHAIR_FACTS_FIXTURE = `
<h2>The numbers behind the rule</h2>
<p>Only about 10% of the chairs we test make it into our showroom.</p>
<p>Our 35,000 square foot Design Center in Dallas holds every survivor.</p>
<p>We ask every vendor about their 10-year warranty before we sit down.</p>
<p>Comfort is subjective. Durability is not.</p>
<p>Sarah Thompson founded the company at 5'4" and tests every chair herself.</p>
<p><strong>A chair is never just a chair.</strong></p>
`;

describe("extractConcreteDetails", () => {
  it("pulls sentences with percentages, dimensions, warranties, and names", () => {
    const details = extractConcreteDetails(CHAIR_FACTS_FIXTURE);
    assert.ok(details.some((d) => /10%/.test(d)));
    assert.ok(details.some((d) => /35,000/.test(d)));
    assert.ok(details.some((d) => /10-year warranty/i.test(d)));
    assert.ok(details.some((d) => /Sarah Thompson/.test(d)));
  });

  it("returns empty for abstract copy", () => {
    const details = extractConcreteDetails(
      "<p>Good design supports wellbeing and fosters a sense of belonging for everyone involved in the community.</p>",
    );
    assert.equal(details.length, 0);
  });
});

describe("extractRhythmMetrics", () => {
  it("detects short paragraphs, fragments, and bold lines", () => {
    const rhythm = extractRhythmMetrics(CHAIR_FACTS_FIXTURE);
    assert.ok(rhythm.shortParagraphShare > 0);
    assert.equal(rhythm.hasFragments, true);
    assert.equal(rhythm.hasBoldLines, true);
  });

  it("reports no rhythm markers for uniform long prose", () => {
    const longP = `<p>${"This paragraph contains many words that flow together without any short punchy statements at all and continues onward steadily. ".repeat(2)}</p>`;
    const rhythm = extractRhythmMetrics(`${longP}${longP}${longP}`);
    assert.equal(rhythm.shortParagraphShare, 0);
    assert.equal(rhythm.hasBoldLines, false);
  });

  it("is persisted on the deterministic kit with concrete details", () => {
    const kit = extractComposeStyleKitDeterministic(CHAIR_FACTS_FIXTURE);
    assert.ok(kit.rhythm);
    assert.ok(kit.concreteDetails.length >= 3);
  });
});
