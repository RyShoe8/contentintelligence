import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_TICK_ATTEMPTS,
  runScheduleTickFetch,
  TICK_RETRY_DELAY_MS,
} from "./schedule-tick-fetch.js";

describe("runScheduleTickFetch", () => {
  it("returns on first successful tick without retry", async () => {
    let tickCalls = 0;
    let healthCalls = 0;
    const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.endsWith("/health")) {
        healthCalls++;
        return new Response("ok", { status: 200 });
      }
      tickCalls++;
      return new Response(
        JSON.stringify({
          accepted: true,
          due_count: 1,
          content_signal_id: "00000000-0000-4000-8000-000000000001",
        }),
        { status: 202 },
      );
    };

    const result = await runScheduleTickFetch({
      workerBase: "https://worker.example",
      headers: { "Content-Type": "application/json" },
      fetchFn: fetchFn as typeof fetch,
      sleepFn: async () => {},
    });

    assert.equal(tickCalls, 1);
    assert.equal(healthCalls, 0);
    assert.equal(result.tick_attempts, 1);
    assert.equal(result.schedule_tick_status, 202);
    assert.equal(result.accepted, true);
    assert.equal(result.due_count, 1);
    assert.equal(result.error, undefined);
  });

  it("retries tick after network failure on first attempt", async () => {
    let tickCalls = 0;
    const sleeps: number[] = [];
    const fetchFn = async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.endsWith("/health")) {
        return new Response("ok", { status: 200 });
      }
      tickCalls++;
      if (tickCalls === 1) {
        throw new TypeError("fetch failed");
      }
      return new Response(JSON.stringify({ accepted: false, due_count: 0 }), { status: 200 });
    };

    const result = await runScheduleTickFetch({
      workerBase: "https://worker.example",
      headers: {},
      fetchFn: fetchFn as typeof fetch,
      sleepFn: async (ms) => {
        sleeps.push(ms);
      },
      maxTickAttempts: MAX_TICK_ATTEMPTS,
    });

    assert.equal(tickCalls, 2);
    assert.deepEqual(sleeps, [TICK_RETRY_DELAY_MS]);
    assert.equal(result.tick_attempts, 2);
    assert.equal(result.schedule_tick_status, 200);
    assert.equal(result.worker_wake_ok, true);
  });

  it("returns error after exhausting tick attempts", async () => {
    const fetchFn = async () => {
      throw new TypeError("fetch failed");
    };

    const result = await runScheduleTickFetch({
      workerBase: "https://worker.example",
      headers: {},
      fetchFn: fetchFn as typeof fetch,
      sleepFn: async () => {},
      maxTickAttempts: 2,
      tickRetryDelayMs: 1,
      healthTimeoutMs: 1,
      tickTimeoutMs: 1,
    });

    assert.equal(result.error, "fetch failed");
    assert.equal(result.tick_attempts, 2);
    assert.equal(result.schedule_tick_status, null);
  });
});
