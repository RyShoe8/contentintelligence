import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPOSE_STALE_MS,
  isComposePendingStale,
  shouldPollCompose,
} from "./compose-poll.js";

describe("shouldPollCompose", () => {
  it("polls when pending with compose_requested_at within stale window", () => {
    const requested = new Date(Date.now() - 60_000);
    assert.equal(
      shouldPollCompose({
        compose_status: "pending",
        compose_requested_at: requested,
      }),
      true,
    );
  });

  it("does not poll pending without compose_requested_at", () => {
    assert.equal(
      shouldPollCompose({
        compose_status: "pending",
        updated_at: new Date(),
      }),
      false,
    );
  });

  it("does not poll when ready", () => {
    assert.equal(
      shouldPollCompose({
        compose_status: "ready",
        compose_requested_at: new Date(),
      }),
      false,
    );
  });
});

describe("isComposePendingStale", () => {
  it("is stale when requested_at exceeds window", () => {
    const old = new Date(Date.now() - COMPOSE_STALE_MS - 1000);
    assert.equal(
      isComposePendingStale({
        compose_status: "pending",
        compose_requested_at: old,
      }),
      true,
    );
  });

  it("legacy pending uses updated_at for staleness", () => {
    const old = new Date(Date.now() - COMPOSE_STALE_MS - 1000);
    assert.equal(
      isComposePendingStale({
        compose_status: "pending",
        updated_at: old,
      }),
      true,
    );
  });
});
