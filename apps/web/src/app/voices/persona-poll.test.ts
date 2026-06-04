import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPersonaPendingStale,
  PERSONA_STALE_MS,
  shouldPollPersona,
} from "./persona-poll.js";

describe("shouldPollPersona", () => {
  it("polls when generating=1 and pending", () => {
    assert.equal(
      shouldPollPersona({ persona_status: "pending" }, "1"),
      true,
    );
  });

  it("does not poll for save-only pending without persona_requested_at", () => {
    assert.equal(
      shouldPollPersona({
        persona_status: "pending",
        updated_at: new Date(),
      }),
      false,
    );
  });

  it("polls after generate kick while within stale window", () => {
    const requested = new Date(Date.now() - 60_000);
    assert.equal(
      shouldPollPersona({
        persona_status: "pending",
        persona_requested_at: requested,
      }),
      true,
    );
  });

  it("does not poll when ready", () => {
    assert.equal(
      shouldPollPersona({ persona_status: "ready", persona_requested_at: new Date() }, "1"),
      false,
    );
  });
});

describe("isPersonaPendingStale", () => {
  it("is stale when requested_at exceeds window", () => {
    const old = new Date(Date.now() - PERSONA_STALE_MS - 1000);
    assert.equal(
      isPersonaPendingStale({
        persona_status: "pending",
        persona_requested_at: old,
      }),
      true,
    );
  });

  it("legacy pending uses updated_at for staleness", () => {
    const old = new Date(Date.now() - PERSONA_STALE_MS - 1000);
    assert.equal(
      isPersonaPendingStale({
        persona_status: "pending",
        updated_at: old,
      }),
      true,
    );
  });
});
