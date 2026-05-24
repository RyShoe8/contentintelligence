import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExpiredSignalItemsFilter,
  isWithinLookback,
  lookbackCutoffDate,
  maxAgeExprFilter,
  signalItemRecencyDate,
} from "./retention.js";

describe("signalItemRecencyDate", () => {
  it("prefers email_sent_at over created_at", () => {
    const sent = new Date("2026-05-20T12:00:00Z");
    const created = new Date("2026-05-22T12:00:00Z");
    assert.equal(
      signalItemRecencyDate({ email_sent_at: sent, created_at: created }).getTime(),
      sent.getTime(),
    );
  });

  it("falls back to created_at when email_sent_at is missing", () => {
    const created = new Date("2026-05-22T12:00:00Z");
    assert.equal(signalItemRecencyDate({ created_at: created }).getTime(), created.getTime());
  });
});

describe("isWithinLookback", () => {
  const now = new Date("2026-05-22T12:00:00Z");

  it("keeps item inside 168h window by email_sent_at", () => {
    const item = {
      email_sent_at: new Date("2026-05-20T12:00:00Z"),
      created_at: new Date("2026-05-21T12:00:00Z"),
    };
    assert.equal(isWithinLookback(item, 168, now), true);
  });

  it("drops item older than lookback by email_sent_at", () => {
    const item = {
      email_sent_at: new Date("2026-05-01T12:00:00Z"),
      created_at: new Date("2026-05-21T12:00:00Z"),
    };
    assert.equal(isWithinLookback(item, 168, now), false);
  });

  it("uses created_at when email_sent_at is missing", () => {
    const fresh = { created_at: new Date("2026-05-21T12:00:00Z") };
    const stale = { created_at: new Date("2026-05-01T12:00:00Z") };
    assert.equal(isWithinLookback(fresh, 168, now), true);
    assert.equal(isWithinLookback(stale, 168, now), false);
  });
});

describe("lookbackCutoffDate", () => {
  it("defaults invalid hours to 168", () => {
    const now = new Date("2026-05-22T12:00:00Z");
    const cutoff = lookbackCutoffDate(0, now);
    assert.equal(cutoff.getTime(), now.getTime() - 168 * 3600_000);
  });
});

describe("maxAgeExprFilter", () => {
  it("builds gte expr on recency fields", () => {
    const cutoff = new Date("2026-05-15T00:00:00Z");
    assert.deepEqual(maxAgeExprFilter(cutoff), {
      $expr: {
        $gte: [{ $ifNull: ["$email_sent_at", "$created_at"] }, cutoff],
      },
    });
  });
});

describe("buildExpiredSignalItemsFilter", () => {
  it("scopes to content signal and lt cutoff", () => {
    const now = new Date("2026-05-22T12:00:00Z");
    const filter = buildExpiredSignalItemsFilter("signal-1", 24, now);
    const andClause = filter.$and as Record<string, unknown>[];
    assert.deepEqual(andClause[0], {
      $or: [{ content_signal_id: "signal-1" }, { vertical_id: "signal-1" }],
    });
    const expr = andClause[1] as { $expr: { $lt: [unknown, Date] } };
    assert.deepEqual(expr.$expr.$lt[0], { $ifNull: ["$email_sent_at", "$created_at"] });
    assert.equal(expr.$expr.$lt[1].getTime(), lookbackCutoffDate(24, now).getTime());
  });
});
