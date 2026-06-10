import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectComposeHardVoiceRetryIssues,
  hasComposeHardVoiceFailures,
} from "@content-resourcer/db";

describe("compose hard voice helpers for retry loop", () => {
  it("hasComposeHardVoiceFailures detects forbidden headings", () => {
    const html = "<h2>Got Questions? We've Got Answers!</h2><p>We answer below.</p>";
    assert.equal(hasComposeHardVoiceFailures(html), true);
    const issues = collectComposeHardVoiceRetryIssues(html);
    assert.ok(issues.length > 0);
  });

  it("passes clean editorial html", () => {
    const html = "<h2>We test every chair</h2><p>We never specify untested seating.</p>";
    assert.equal(hasComposeHardVoiceFailures(html), false);
  });
});
