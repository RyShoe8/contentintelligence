import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetMongoClient } from "./client.js";

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
