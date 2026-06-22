import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createExclusiveRunner } from "./posts-sync-lock.js";

describe("createExclusiveRunner", () => {
  it("rejects duplicate job for same key", async () => {
    const runner = createExclusiveRunner("posts_sync_already_running");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = runner.run("signal-x", async () => {
      await gate;
      return { created: 1 };
    });
    assert.equal(runner.isInFlight("signal-x"), true);
    await assert.rejects(
      () => runner.run("signal-x", async () => ({ created: 2 })),
      /posts_sync_already_running/,
    );
    release();
    await first;
    assert.equal(runner.isInFlight("signal-x"), false);
  });

  it("allows concurrent jobs for different keys", async () => {
    const runner = createExclusiveRunner("posts_sync_already_running");
    const order: string[] = [];
    await Promise.all([
      runner.run("a", async () => {
        order.push("a");
      }),
      runner.run("b", async () => {
        order.push("b");
      }),
    ]);
    assert.deepEqual(order.sort(), ["a", "b"]);
  });
});
