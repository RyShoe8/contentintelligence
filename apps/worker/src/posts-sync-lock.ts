import { withDbRetry } from "@content-resourcer/db";
import {
  syncPostsForContentSignal,
  type PostsSyncOptions,
  type PostsSyncResult,
} from "./posts-sync.js";

export function createExclusiveRunner(duplicateError: string) {
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    isInFlight(key: string): boolean {
      return inFlight.has(key);
    },
    run<T>(key: string, fn: () => Promise<T>): Promise<T> {
      if (inFlight.has(key)) {
        return Promise.reject(new Error(duplicateError));
      }
      const job = fn().finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, job);
      return job;
    },
    clear(): void {
      inFlight.clear();
    },
  };
}

const postsSyncRunner = createExclusiveRunner("posts_sync_already_running");

export function isPostsSyncInFlight(contentSignalId: string): boolean {
  return postsSyncRunner.isInFlight(contentSignalId);
}

export async function runPostsSyncWithRetry(
  contentSignalId: string,
  opts?: PostsSyncOptions,
): Promise<PostsSyncResult> {
  return withDbRetry((db) => syncPostsForContentSignal(db, contentSignalId, opts));
}

/** Run posts sync for one content signal; rejects if that signal already has a job in flight. */
export function runPostsSyncExclusive(
  contentSignalId: string,
  opts?: PostsSyncOptions,
): Promise<PostsSyncResult> {
  return postsSyncRunner.run(contentSignalId, () => runPostsSyncWithRetry(contentSignalId, opts));
}

/** Test helper */
export function clearPostsSyncInFlight(): void {
  postsSyncRunner.clear();
}
