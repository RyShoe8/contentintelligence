import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isComposeHowToTopic } from "./compose-topic-mode.js";

describe("isComposeHowToTopic", () => {
  it("detects how-to topics from the topic string", () => {
    assert.equal(
      isComposeHowToTopic("How to setup your email signature in Apple Mail"),
      true,
    );
    assert.equal(isComposeHowToTopic("Tax implications of online casino winnings"), false);
  });

  it("detects procedural subtopics even when the topic is broad", () => {
    assert.equal(
      isComposeHowToTopic("Email signature guide", ["Import a custom HTML signature file"]),
      true,
    );
    assert.equal(
      isComposeHowToTopic("Senior living design guidelines", ["Lighting and corridors"]),
      false,
    );
  });
});
