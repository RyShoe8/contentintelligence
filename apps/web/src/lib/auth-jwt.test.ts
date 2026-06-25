import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRefreshJwtFromDb } from "./auth-jwt.js";

describe("shouldRefreshJwtFromDb", () => {
  it("skips DB on routine session reads when organizationId is on the token", () => {
    assert.equal(
      shouldRefreshJwtFromDb({
        organizationId: "org-1",
        trigger: undefined,
      }),
      false,
    );
  });

  it("refreshes on first sign-in", () => {
    assert.equal(
      shouldRefreshJwtFromDb({
        organizationId: "org-1",
        user: { email: "a@example.com" },
      }),
      true,
    );
  });

  it("refreshes on explicit session update", () => {
    assert.equal(
      shouldRefreshJwtFromDb({
        organizationId: "org-1",
        trigger: "update",
      }),
      true,
    );
  });

  it("refreshes when organizationId is missing from the token", () => {
    assert.equal(
      shouldRefreshJwtFromDb({
        organizationId: undefined,
      }),
      true,
    );
  });
});
