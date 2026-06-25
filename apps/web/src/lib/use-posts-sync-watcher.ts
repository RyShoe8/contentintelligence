"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeIngestError } from "@/lib/ingest-response";
import {
  fetchIngestStatus,
  INGEST_POLL_INTERVAL_MS,
  INGEST_POLL_TIMEOUT_MS,
  isPostsSyncRunningForSignal,
  isSyncComplete,
  isSyncInProgressForSignal,
  type IngestStatusResponse,
} from "@/lib/ingest-status-poll";

export type PostsSyncWatcherState = {
  watching: boolean;
  message: string | null;
  error: string | null;
};

type Options = {
  contentSignalId: string;
  enabled: boolean;
  syncPending?: boolean;
  onComplete: () => void;
};

function progressMessage(data: IngestStatusResponse, contentSignalId: string): string {
  if (isPostsSyncRunningForSignal(data, contentSignalId)) {
    return "Feed sync finished — rebuilding drafts…";
  }
  return "Sync in progress…";
}

export function usePostsSyncWatcher({
  contentSignalId,
  enabled,
  syncPending = false,
  onComplete,
}: Options): PostsSyncWatcherState {
  const [state, setState] = useState<PostsSyncWatcherState>({
    watching: false,
    message: null,
    error: null,
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const finishPolling = useCallback(
    (statusData: IngestStatusResponse) => {
      stopPolling();
      const postsSyncError = statusData.posts_sync_error?.trim();
      setState({
        watching: false,
        message: null,
        error: postsSyncError
          ? `Draft rebuild failed (${sanitizeIngestError(postsSyncError)}). Try Refresh posts.`
          : null,
      });
      onCompleteRef.current();
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (initialMessage: string) => {
      stopPolling();
      pollStartedRef.current = Date.now();
      setState({ watching: true, message: initialMessage, error: null });

      const tick = async () => {
        if (Date.now() - pollStartedRef.current > INGEST_POLL_TIMEOUT_MS) {
          stopPolling();
          setState({
            watching: false,
            message: null,
            error: "Draft rebuild is taking longer than expected — try Refresh posts.",
          });
          return;
        }

        const data = await fetchIngestStatus();
        if (!data) return;

        if (isSyncComplete(data, contentSignalId)) {
          finishPolling(data);
          return;
        }

        setState((prev) => ({
          ...prev,
          watching: true,
          message: progressMessage(data, contentSignalId),
        }));
      };

      void tick();
      pollRef.current = setInterval(() => void tick(), INGEST_POLL_INTERVAL_MS);
    },
    [contentSignalId, finishPolling, stopPolling],
  );

  useEffect(() => {
    if (!enabled || !contentSignalId) {
      stopPolling();
      setState({ watching: false, message: null, error: null });
      return;
    }

    let cancelled = false;

    void (async () => {
      if (syncPending) {
        if (!cancelled) startPolling("Settings saved — rebuilding drafts…");
        return;
      }

      const data = await fetchIngestStatus();
      if (cancelled || !data) return;

      if (isSyncInProgressForSignal(data, contentSignalId)) {
        startPolling(progressMessage(data, contentSignalId));
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [contentSignalId, enabled, startPolling, stopPolling, syncPending]);

  return state;
}
