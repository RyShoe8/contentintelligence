import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GMAIL_REFRESH_TOKEN_TTL_DAYS,
  formatGmailOAuthCallbackError,
  gmailDaysUntilRefreshExpiry,
  gmailRefreshExpirySeverity,
  isGmailRefreshTokenExpired,
  shouldResetGmailRefreshTokenIssuedAt,
} from "./gmail-oauth.js";
import { contentSignalIngestAttemptFailed } from "./post-repos.js";

describe("gmailDaysUntilRefreshExpiry", () => {
  it("returns full TTL when issued now", () => {
    const now = new Date("2026-05-27T12:00:00Z");
    assert.equal(
      gmailDaysUntilRefreshExpiry(
        { refresh_token_issued_at: now, updated_at: now },
        now,
      ),
      GMAIL_REFRESH_TOKEN_TTL_DAYS,
    );
  });

  it("warns at day 5-6 (1-2 days left)", () => {
    const issued = new Date("2026-05-20T12:00:00Z");
    const now = new Date("2026-05-25T12:00:00Z");
    const days = gmailDaysUntilRefreshExpiry(
      { refresh_token_issued_at: issued, updated_at: issued },
      now,
    );
    assert.equal(days, 2);
    assert.equal(gmailRefreshExpirySeverity(days), "warn");
  });

  it("expires at day 7+", () => {
    const issued = new Date("2026-05-19T12:00:00Z");
    const now = new Date("2026-05-27T12:00:00Z");
    assert.equal(
      isGmailRefreshTokenExpired(
        { refresh_token_issued_at: issued, updated_at: issued },
        now,
      ),
      true,
    );
    assert.equal(
      gmailDaysUntilRefreshExpiry(
        { refresh_token_issued_at: issued, updated_at: issued },
        now,
      ),
      0,
    );
  });

  it("falls back to updated_at when issued_at missing", () => {
    const updated = new Date("2026-05-26T12:00:00Z");
    const now = new Date("2026-05-27T12:00:00Z");
    assert.equal(gmailDaysUntilRefreshExpiry({ updated_at: updated }, now), 6);
  });
});

describe("shouldResetGmailRefreshTokenIssuedAt", () => {
  it("resets on user reconnect even without a new refresh token string", () => {
    assert.equal(
      shouldResetGmailRefreshTokenIssuedAt({
        userReconnect: true,
        hasExistingIssuedAt: true,
      }),
      true,
    );
  });

  it("does not reset when reconnect flag is absent and issued_at exists", () => {
    assert.equal(
      shouldResetGmailRefreshTokenIssuedAt({
        hasExistingIssuedAt: true,
      }),
      false,
    );
  });
});

describe("formatGmailOAuthCallbackError", () => {
  it("maps no_new_refresh_token to a user-facing message", () => {
    assert.match(formatGmailOAuthCallbackError("no_new_refresh_token"), /revoke app access/i);
  });
});

describe("contentSignalIngestAttemptFailed", () => {
  it("detects failed attempt after last successful sync", () => {
    assert.equal(
      contentSignalIngestAttemptFailed({
        last_ingest_completed_at: new Date("2026-05-20T12:00:00Z"),
        last_ingest_attempt_at: new Date("2026-05-27T12:00:00Z"),
        last_ingest_error: "Gmail authorization expired",
      }),
      true,
    );
  });

  it("returns false when last sync is newer than the attempt", () => {
    assert.equal(
      contentSignalIngestAttemptFailed({
        last_ingest_completed_at: new Date("2026-05-27T13:00:00Z"),
        last_ingest_attempt_at: new Date("2026-05-27T12:00:00Z"),
        last_ingest_error: "Gmail authorization expired",
      }),
      false,
    );
  });
});
