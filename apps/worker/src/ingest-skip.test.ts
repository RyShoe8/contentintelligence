import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldSkipProcessedMessage } from "./ingest-skip.js";

describe("shouldSkipProcessedMessage", () => {
  it("skips when row is ai_processed with deal metrics", () => {
    assert.equal(
      shouldSkipProcessedMessage(
        {
          ai_processed: true,
          deal_metrics: { effective_savings_pct: 0.5, confidence: 0.8 },
          skip_reason: null,
        } as never,
        false,
      ),
      true,
    );
  });

  it("does not skip when force reprocess is enabled", () => {
    assert.equal(
      shouldSkipProcessedMessage(
        {
          ai_processed: true,
          deal_metrics: { effective_savings_pct: 0.5, confidence: 0.8 },
          skip_reason: null,
        } as never,
        true,
      ),
      false,
    );
  });

  it("does not skip minimal rows with skip_reason", () => {
    assert.equal(
      shouldSkipProcessedMessage(
        {
          ai_processed: false,
          deal_metrics: undefined,
          skip_reason: "too_short",
        } as never,
        false,
      ),
      false,
    );
  });
});
