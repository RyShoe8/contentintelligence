import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractStyleExampleHeadings,
  formatComposeOutlineForPrompt,
} from "./compose-outline.js";

describe("extractStyleExampleHeadings", () => {
  it("collects unique h2/h3 headings from style examples", () => {
    const headings = extractStyleExampleHeadings([
      {
        title: "Example A",
        html: "<h2>We start with chairs</h2><p>Body</p><h3>The sit test</h3>",
      },
      {
        title: "Example B",
        html: "<h2>We start with chairs</h2><h2>Lighting sets the mood</h2>",
      },
    ]);

    assert.deepEqual(headings, ["We start with chairs", "The sit test", "Lighting sets the mood"]);
  });
});

describe("formatComposeOutlineForPrompt", () => {
  it("serializes outline for reconstruction prompt", () => {
    const block = formatComposeOutlineForPrompt({
      sections: [
        { heading: "Chairs first", factSummary: "Sit test and comfort facts" },
        { heading: "Light matters", factSummary: "Circadian and glare facts" },
      ],
    });
    assert.match(block, /Editorial outline/);
    assert.match(block, /Chairs first/);
    assert.match(block, /Light matters/);
  });
});
