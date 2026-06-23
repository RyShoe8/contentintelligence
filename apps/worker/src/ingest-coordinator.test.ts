import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createIngestCoordinator } from "./ingest-coordinator.js";
import type { IngestStats } from "./ingest.js";

const baseStats: IngestStats = {
  sources: 1,
  messagesListed: 2,
  skippedDuplicate: 0,
  skippedError: 0,
  storedMinimal: 0,
  storedFull: 1,
  updatedFull: 0,
  purgedItems: 0,
  archivedPosts: 0,
  sourceErrors: [],
};

describe("createIngestCoordinator", () => {
  it("clears ingest in-flight before posts sync completes", async () => {
    let releasePosts!: () => void;
    const postsGate = new Promise<void>((resolve) => {
      releasePosts = resolve;
    });

    const coordinator = createIngestCoordinator({
      runIngest: async () => baseStats,
      runPostsSync: async () => {
        await postsGate;
        return { created: 0, updated: 0, archived: 0, skipped: 0 };
      },
      log: () => {},
      onError: () => {},
    });

    void coordinator.startIngest("signal-1", "http_post", false);
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(coordinator.isInFlight(), false);
    assert.equal(coordinator.getStatus().running, false);
    assert.equal(coordinator.getStatus().posts_sync_running, true);

    releasePosts();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(coordinator.getStatus().posts_sync_running, false);
  });

  it("records posts sync errors without blocking ingest completion", async () => {
    const coordinator = createIngestCoordinator({
      runIngest: async () => baseStats,
      runPostsSync: async () => {
        throw new Error("connection timed out");
      },
      log: () => {},
      onError: () => {},
    });

    await coordinator.startIngest("signal-2", "http_post", false);
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(coordinator.getStatus().running, false);
    assert.equal(coordinator.getStatus().posts_sync_running, false);
    assert.equal(coordinator.getStatus().posts_sync_error, "connection timed out");
    assert.equal(coordinator.getStatus().posts_sync_result, null);
  });

  it("startPostsSync runs background posts sync with status tracking", async () => {
    let releasePosts!: () => void;
    const postsGate = new Promise<void>((resolve) => {
      releasePosts = resolve;
    });

    const coordinator = createIngestCoordinator({
      runIngest: async () => baseStats,
      runPostsSync: async () => {
        await postsGate;
        return { created: 1, updated: 0, archived: 0, skipped: 0 };
      },
      log: () => {},
      onError: () => {},
    });

    coordinator.startPostsSync("signal-3", false);
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(coordinator.getStatus().posts_sync_running, true);
    assert.equal(coordinator.getStatus().posts_sync_content_signal_id, "signal-3");

    releasePosts();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(coordinator.getStatus().posts_sync_running, false);
    assert.equal(coordinator.getStatus().posts_sync_error, null);
    assert.deepEqual(coordinator.getStatus().posts_sync_result, {
      created: 1,
      updated: 0,
      archived: 0,
      skipped: 0,
    });
  });

  it("preserves posts_sync_running when a second ingest starts", async () => {
    let releasePosts!: () => void;
    const postsGate = new Promise<void>((resolve) => {
      releasePosts = resolve;
    });

    const coordinator = createIngestCoordinator({
      runIngest: async () => baseStats,
      runPostsSync: async () => {
        await postsGate;
        return { created: 2, updated: 1, archived: 0, skipped: 0 };
      },
      log: () => {},
      onError: () => {},
    });

    void coordinator.startIngest("signal-1", "http_post", false);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(coordinator.getStatus().posts_sync_running, true);

    void coordinator.startIngest(undefined, "cron", false);
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(coordinator.getStatus().posts_sync_running, true);
    assert.equal(coordinator.getStatus().posts_sync_content_signal_id, "signal-1");

    releasePosts();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(coordinator.getStatus().posts_sync_running, false);
    assert.equal(coordinator.getStatus().posts_sync_result?.created, 2);
  });
});
