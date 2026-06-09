import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatStyleExamplesSyncSummary } from "@content-resourcer/db";
import type { IngestVoiceRssStyleExamplesResult } from "./ingest-voice-rss-style-examples.js";

describe("ingestVoiceRssStyleExamples result shape", () => {
  it("formatStyleExamplesSyncSummary handles skip_reasons from ingest result", () => {
    const result: IngestVoiceRssStyleExamplesResult = {
      ingested: 1,
      updated: 0,
      skipped: 3,
      failed: 0,
      skip_reasons: { excluded: 1, invalid_url: 1, no_body: 1 },
    };
    const summary = formatStyleExamplesSyncSummary(result);
    assert.match(summary, /1 imported/);
    assert.match(summary, /3 skipped/);
    assert.match(summary, /1 no body/);
  });

  it("formatStyleExamplesSyncSummary handles feed_fetch_failed", () => {
    const result: IngestVoiceRssStyleExamplesResult = {
      ingested: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      feed_fetch_failed: true,
    };
    assert.match(formatStyleExamplesSyncSummary(result), /feed fetch failed/);
  });
});
