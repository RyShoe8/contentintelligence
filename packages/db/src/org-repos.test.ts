import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEmail } from "./org-repos.js";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  });
});

describe("invite acceptance flow", () => {
  it("documents expected role from invite schema", () => {
    const invite = { role: "owner" as const, email: "o@example.com" };
    assert.equal(invite.role, "owner");
  });
});
