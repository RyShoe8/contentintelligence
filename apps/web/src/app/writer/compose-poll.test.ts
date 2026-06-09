import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  COMPOSE_ORPHAN_MS,
  COMPOSE_STALE_MS,
  COMPOSE_STALL_MESSAGE,
  clearComposePollMode,
  composePollModeStorageKey,
  composeProgressLabel,
  isComposePendingOrphan,
  isComposePendingStale,
  resolveComposePollMode,
  saveComposePollMode,
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
  it("is orphan when pending too long with no generated_html", () => {
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

  it("is not orphan when generated_html exists", () => {
    const old = new Date(Date.now() - COMPOSE_ORPHAN_MS - 1000);
    assert.equal(
      isComposePendingOrphan({
        compose_status: "pending",
        compose_requested_at: old,
        generated_html: "<p>draft</p>",
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
    assert.equal(resolveComposePollMode(articleId, "full"), "write_only");
  });

  it("clears stored poll mode", () => {
    saveComposePollMode(articleId, "full");
    clearComposePollMode(articleId);
    assert.equal(storedComposePollMode(articleId), null);
    assert.equal(resolveComposePollMode(articleId), "full");
  });

  it("uses stable storage key", () => {
    assert.equal(
      composePollModeStorageKey(articleId),
      `writer-compose-poll-mode:${articleId}`,
    );
  });
});

describe("COMPOSE_STALL_MESSAGE", () => {
  it("mentions retry", () => {
    assert.match(COMPOSE_STALL_MESSAGE, /Write again to retry/i);
  });
});
