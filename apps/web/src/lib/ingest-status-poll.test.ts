import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPostsSyncRunningForSignal,
  isSyncComplete,
  isSyncInProgressForSignal,
  postsSyncAppliesToSignal,
} from "./ingest-status-poll.js";

const signalA = "00000000-0000-4000-8000-000000000001";
const signalB = "00000000-0000-4000-8000-000000000002";

describe("postsSyncAppliesToSignal", () => {
  it("applies when posts_sync_content_signal_id is null", () => {
    assert.equal(postsSyncAppliesToSignal({ posts_sync_content_signal_id: null }, signalA), true);
  });

  it("applies only to matching signal id", () => {
    assert.equal(
      postsSyncAppliesToSignal({ posts_sync_content_signal_id: signalA }, signalA),
      true,
    );
    assert.equal(
      postsSyncAppliesToSignal({ posts_sync_content_signal_id: signalB }, signalA),
      false,
    );
  });
});

describe("isSyncComplete", () => {
  it("is false when ingest is running for the signal", () => {
    assert.equal(
      isSyncComplete(
        { running: true, content_signal_id: signalA, posts_sync_running: false },
        signalA,
      ),
      false,
    );
  });

  it("is false when posts sync is running for the signal", () => {
    assert.equal(
      isSyncComplete(
        {
          running: false,
          posts_sync_running: true,
          posts_sync_content_signal_id: signalA,
        },
        signalA,
      ),
      false,
    );
  });

  it("is false when another signal's ingest is running", () => {
    assert.equal(
      isSyncComplete(
        { running: true, content_signal_id: signalB, posts_sync_running: false },
        signalA,
      ),
      false,
    );
  });

  it("is true when another signal's posts sync is running", () => {
    assert.equal(
      isSyncComplete(
        {
          running: false,
          posts_sync_running: true,
          posts_sync_content_signal_id: signalB,
        },
        signalA,
      ),
      true,
    );
  });

  it("is true when idle for the signal", () => {
    assert.equal(
      isSyncComplete({ running: false, posts_sync_running: false }, signalA),
      true,
    );
  });
});

describe("isSyncInProgressForSignal", () => {
  it("detects posts sync in progress", () => {
    assert.equal(
      isSyncInProgressForSignal(
        { posts_sync_running: true, posts_sync_content_signal_id: signalA },
        signalA,
      ),
      true,
    );
    assert.equal(isPostsSyncRunningForSignal(
      { posts_sync_running: true, posts_sync_content_signal_id: signalA },
      signalA,
    ), true);
  });
});
