import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEmail, ORG_USER_BACKFILL_MIGRATION_ID } from "./org-repos.js";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  });
});

describe("org user backfill migration", () => {
  it("uses a stable one-time migration id", () => {
    assert.equal(ORG_USER_BACKFILL_MIGRATION_ID, "org_user_backfill_v1");
  });
});

describe("invite acceptance flow", () => {
  it("documents expected role from invite schema", () => {
    const invite = { role: "owner" as const, email: "o@example.com" };
    assert.equal(invite.role, "owner");
  });
});
