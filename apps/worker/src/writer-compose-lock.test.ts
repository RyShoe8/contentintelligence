import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearWriterComposeJobsInFlight,
  isWriterComposeJobInFlight,
  runWriterComposeJobExclusive,
} from "./writer-compose-lock.js";

describe("runWriterComposeJobExclusive", () => {
  it("allows concurrent jobs for different article ids", async () => {
    clearWriterComposeJobsInFlight();
    const order: string[] = [];
    const a = runWriterComposeJobExclusive("article-a", async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 30));
      order.push("a-end");
    });
    const b = runWriterComposeJobExclusive("article-b", async () => {
      order.push("b-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("b-end");
    });
    await Promise.all([a, b]);
    assert.deepEqual(order, ["a-start", "b-start", "b-end", "a-end"]);
    assert.equal(isWriterComposeJobInFlight("article-a"), false);
    assert.equal(isWriterComposeJobInFlight("article-b"), false);
  });

  it("rejects duplicate job for same article id", async () => {
    clearWriterComposeJobsInFlight();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const first = runWriterComposeJobExclusive("article-x", async () => {
      await gate;
    });
    assert.equal(isWriterComposeJobInFlight("article-x"), true);
    assert.throws(
      () =>
        runWriterComposeJobExclusive("article-x", async () => {
          /* noop */
        }),
      /compose_already_running/,
    );
    release();
    await first;
  });
});
