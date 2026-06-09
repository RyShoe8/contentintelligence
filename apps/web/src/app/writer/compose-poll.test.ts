import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  COMPOSE_ORPHAN_MS,
  COMPOSE_READY_CLOCK_BUFFER_MS,
  COMPOSE_STALE_MS,
  COMPOSE_STALL_MESSAGE,
  clearComposePollMode,
  composePollModeStorageKey,
  composeProgressLabel,
  isComposePendingOrphan,
  isComposePendingStale,
  isComposeReadyForPoll,
  resolveComposePollMode,
  saveComposePollMode,
  shouldAcceptComposePollReady,
  shouldPollCompose,
  storedComposePollMode,
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

describe("isComposePendingOrphan", () => {
  it("is orphan when pending exceeds orphan window", () => {
    const old = new Date(Date.now() - COMPOSE_ORPHAN_MS - 1000);
    assert.equal(
      isComposePendingOrphan({
        compose_status: "pending",
        compose_requested_at: old,
        generated_html: "",
      }),
      true,
    );
  });

  it("is not orphan when pending inside orphan window even with empty generated_html", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    assert.equal(
      isComposePendingOrphan({
        compose_status: "pending",
        compose_requested_at: recent,
        generated_html: "",
      }),
      false,
    );
  });

  it("is not orphan inside orphan window", () => {
    const recent = new Date(Date.now() - 60_000);
    assert.equal(
      isComposePendingOrphan({
        compose_status: "pending",
        compose_requested_at: recent,
      }),
      false,
    );
  });
});

describe("composeProgressLabel", () => {
  it("returns Writing for write_only mode", () => {
    assert.equal(composeProgressLabel("write_only"), "Writing…");
  });

  it("returns Researching and writing for full mode", () => {
    assert.equal(composeProgressLabel("full"), "Researching and writing…");
  });
});

describe("compose poll mode sessionStorage", () => {
  const articleId = "00000000-0000-4000-8000-000000000001";
  const storage = new Map<string, string>();

  const originalSessionStorage = globalThis.sessionStorage;

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    });
  });

  it("persists and resolves poll mode", () => {
    assert.equal(storedComposePollMode(articleId), null);
    saveComposePollMode(articleId, "write_only");
    assert.equal(storedComposePollMode(articleId), "write_only");
    assert.equal(resolveComposePollMode(articleId), "write_only");
    assert.equal(resolveComposePollMode(articleId, { fallback: "full" }), "write_only");
  });

  it("clears stored poll mode", () => {
    saveComposePollMode(articleId, "full");
    clearComposePollMode(articleId);
    assert.equal(storedComposePollMode(articleId), null);
    assert.equal(resolveComposePollMode(articleId), "full");
  });

  it("prefers serverPhase over sessionStorage", () => {
    saveComposePollMode(articleId, "full");
    assert.equal(
      resolveComposePollMode(articleId, { serverPhase: "write_only" }),
      "write_only",
    );
  });

  it("falls back to full when server and storage are missing", () => {
    assert.equal(resolveComposePollMode(articleId), "full");
    assert.equal(resolveComposePollMode(articleId, { serverPhase: null }), "full");
  });

  it("uses stable storage key", () => {
    assert.equal(
      composePollModeStorageKey(articleId),
      `writer-compose-poll-mode:${articleId}`,
    );
  });
});

describe("isComposeReadyForPoll", () => {
  const pollStartedAt = Date.parse("2026-05-27T12:00:00.000Z");

  it("accepts ready when compose_requested_at is after poll start", () => {
    assert.equal(
      isComposeReadyForPoll(
        {
          compose_status: "ready",
          compose_requested_at: "2026-05-27T12:00:01.000Z",
        },
        pollStartedAt,
      ),
      true,
    );
  });

  it("rejects stale ready from a prior run before poll start", () => {
    assert.equal(
      isComposeReadyForPoll(
        {
          compose_status: "ready",
          compose_requested_at: "2026-05-27T11:00:00.000Z",
        },
        pollStartedAt,
      ),
      false,
    );
  });

  it("allows small client clock skew via buffer", () => {
    assert.equal(
      isComposeReadyForPoll(
        {
          compose_status: "ready",
          compose_requested_at: new Date(
            pollStartedAt - COMPOSE_READY_CLOCK_BUFFER_MS + 1000,
          ).toISOString(),
        },
        pollStartedAt,
      ),
      true,
    );
  });

  it("returns false when status is not ready", () => {
    assert.equal(
      isComposeReadyForPoll(
        {
          compose_status: "pending",
          compose_requested_at: "2026-05-27T12:00:01.000Z",
        },
        pollStartedAt,
      ),
      false,
    );
  });
});

describe("shouldAcceptComposePollReady", () => {
  const pollStartedAt = Date.parse("2026-05-27T12:00:00.000Z");

  it("accepts ready for joined existing job when compose_requested_at predates poll start", () => {
    assert.equal(
      shouldAcceptComposePollReady(
        {
          compose_status: "ready",
          compose_requested_at: "2026-05-27T11:58:00.000Z",
        },
        pollStartedAt,
        { joinedExistingJob: true },
      ),
      true,
    );
  });

  it("rejects stale ready from prior run when not joined existing job", () => {
    assert.equal(
      shouldAcceptComposePollReady(
        {
          compose_status: "ready",
          compose_requested_at: "2026-05-27T11:00:00.000Z",
        },
        pollStartedAt,
        { joinedExistingJob: false },
      ),
      false,
    );
  });
});

describe("COMPOSE_STALL_MESSAGE", () => {
  it("mentions retry", () => {
    assert.match(COMPOSE_STALL_MESSAGE, /Write again to retry/i);
  });
});
