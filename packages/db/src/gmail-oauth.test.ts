import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GMAIL_REFRESH_TOKEN_TTL_DAYS,
  gmailDaysUntilRefreshExpiry,
  gmailRefreshExpirySeverity,
  isGmailRefreshTokenExpired,
} from "./gmail-oauth.js";

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
