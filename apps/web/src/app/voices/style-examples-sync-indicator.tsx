"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 60 * 1000;

type Props = {
  voiceId: string;
  startPolling: boolean;
  initialExampleCount: number;
  voiceIdParam?: string;
};

export function StyleExamplesSyncIndicator({
  startPolling,
  initialExampleCount,
  voiceIdParam,
}: Props) {
  const router = useRouter();
  const [polling, setPolling] = useState(startPolling && initialExampleCount === 0);
  const [timedOut, setTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const clearSyncParam = useCallback(() => {
    if (!voiceIdParam) return;
    router.replace(`/voices?voice_id=${voiceIdParam}`);
  }, [router, voiceIdParam]);

  useEffect(() => {
    if (!startPolling || initialExampleCount > 0) return;

    pollStartedRef.current = Date.now();
    setPolling(true);
    setTimedOut(false);

    const tick = () => {
      if (Date.now() - pollStartedRef.current > POLL_TIMEOUT_MS) {
        stopPolling();
        setTimedOut(true);
        clearSyncParam();
        return;
      }
      router.refresh();
    };

    void tick();
    pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => stopPolling();
  }, [startPolling, initialExampleCount, router, stopPolling, clearSyncParam]);

  useEffect(() => {
    if (initialExampleCount > 0 && polling) {
      stopPolling();
      clearSyncParam();
    }
  }, [initialExampleCount, polling, stopPolling, clearSyncParam]);

  if (polling) {
    return (
      <div
        className="rounded border border-[var(--primary)]/30 bg-[var(--card)] px-3 py-2 text-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"
            aria-hidden
          />
          <span>Importing articles from RSS…</span>
        </div>
      </div>
    );
  }

  if (timedOut && initialExampleCount === 0) {
    return (
      <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
        Import may still be running — refresh the page. You can also use Generate persona, which
        imports RSS articles before building the persona.
      </p>
    );
  }

  return null;
}
