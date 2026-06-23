import assert from "node:assert/strict";
import type { Db, MongoClient } from "mongodb";
import { afterEach, describe, it } from "node:test";
import { isMongoNetworkError, resetMongoClient, withDbRetry } from "./client.js";

describe("isMongoNetworkError", () => {
  it("matches Mongo network error names", () => {
    for (const name of [
      "MongoNetworkTimeoutError",
      "MongoServerSelectionError",
      "MongoNetworkError",
    ]) {
      assert.equal(isMongoNetworkError({ name }), true);
    }
  });

  it("rejects non-network errors", () => {
    assert.equal(isMongoNetworkError(new Error("validation failed")), false);
    assert.equal(isMongoNetworkError(null), false);
  });
});

describe("withDbRetry", () => {
  const testUri = "mongodb://localhost/test-retry";

  afterEach(async () => {
    await resetMongoClient();
  });

  it("retries once after a network error on fn", async () => {
    const mockDb = {} as Db;
    const mockClient = {
      db: () => mockDb,
      close: async () => {
        globalThis._mongoClientPromise = Promise.resolve(mockClient);
        globalThis._mongoClientUri = testUri;
      },
    } as MongoClient;
    globalThis._mongoClientPromise = Promise.resolve(mockClient);
    globalThis._mongoClientUri = testUri;

    let calls = 0;
    const result = await withDbRetry(async () => {
      calls++;
      if (calls === 1) {
        const err = new Error("connection timed out");
        err.name = "MongoNetworkTimeoutError";
        throw err;
      }
      return "ok";
    }, testUri);

    assert.equal(result, "ok");
    assert.equal(calls, 2);
  });

  it("does not retry non-network errors", async () => {
    const mockDb = {} as Db;
    globalThis._mongoClientPromise = Promise.resolve({
      db: () => mockDb,
      close: async () => {},
    } as MongoClient);
    globalThis._mongoClientUri = testUri;

    await assert.rejects(
      () =>
        withDbRetry(async () => {
          throw new Error("duplicate key");
        }, testUri),
      /duplicate key/,
    );
  });
});

describe("resetMongoClient", () => {
  afterEach(async () => {
    await resetMongoClient();
  });

  it("clears cached client promise and uri", async () => {
    globalThis._mongoClientPromise = Promise.reject(new Error("stale"));
    globalThis._mongoClientUri = "mongodb://example.test/db";
    await resetMongoClient();
    assert.equal(globalThis._mongoClientPromise, undefined);
    assert.equal(globalThis._mongoClientUri, undefined);
  });

  it("is safe when no client is cached", async () => {
    globalThis._mongoClientPromise = undefined;
    globalThis._mongoClientUri = undefined;
    await resetMongoClient();
    assert.equal(globalThis._mongoClientPromise, undefined);
  });
});
