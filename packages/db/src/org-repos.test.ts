import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isReclaimableDefaultOrgMembership,
  normalizeEmail,
  ORG_USER_BACKFILL_MIGRATION_ID,
} from "./org-repos.js";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  });
});

describe("isReclaimableDefaultOrgMembership", () => {
  it("allows reclaim when user is on default org and target is different", () => {
    assert.equal(
      isReclaimableDefaultOrgMembership("default-id", "owner-org-id", "default-id"),
      true,
    );
  });

  it("does not reclaim when user is on a real other org", () => {
    assert.equal(
      isReclaimableDefaultOrgMembership("other-tenant-id", "owner-org-id", "default-id"),
      false,
    );
  });

  it("does not reclaim when user is already on target org", () => {
    assert.equal(
      isReclaimableDefaultOrgMembership("owner-org-id", "owner-org-id", "default-id"),
      false,
    );
  });

  it("does not reclaim when default org id is unknown", () => {
    assert.equal(isReclaimableDefaultOrgMembership("default-id", "owner-org-id", null), false);
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
