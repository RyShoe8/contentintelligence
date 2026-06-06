"use client";

import type { ReactNode } from "react";
import { LocalDateTime } from "@/components/local-date-time";

type Props = {
  lastIngestIso: string | null;
  lastIngestAttemptIso?: string | null;
  lastIngestError?: string | null;
  intervalMinutes: number | null;
  scheduleText: string;
  reconnectHref?: string;
};

function attemptFailedAfterLastSuccess(
  lastIngestIso: string | null,
  lastIngestAttemptIso: string | null | undefined,
  lastIngestError: string | null | undefined,
): boolean {
  if (!lastIngestError || !lastIngestAttemptIso) return false;
  const attemptMs = new Date(lastIngestAttemptIso).getTime();
  if (!Number.isFinite(attemptMs)) return false;
  const completedMs = lastIngestIso ? new Date(lastIngestIso).getTime() : 0;
  return attemptMs > completedMs;
}

function nextSyncDisplay(
  lastIngestIso: string | null,
  lastIngestAttemptIso: string | null | undefined,
  lastIngestError: string | null | undefined,
  intervalMinutes: number | null,
  reconnectHref?: string,
): ReactNode {
  if (
    attemptFailedAfterLastSuccess(lastIngestIso, lastIngestAttemptIso, lastIngestError)
  ) {
    const reconnect = reconnectHref ? (
      <>
        {" "}
        <a href={reconnectHref} className="font-medium text-[var(--primary)] hover:underline">
          Re-connect Gmail
        </a>
      </>
    ) : null;
    return (
      <>
        Last attempt failed: {lastIngestError}
        {reconnect}
      </>
    );
  }

  if (intervalMinutes == null || intervalMinutes <= 0) return "Not scheduled";
  if (!lastIngestIso) return "Due on next schedule tick";

  const last = new Date(lastIngestIso);
  if (!Number.isFinite(last.getTime())) return "Due on next schedule tick";

  const next = new Date(last.getTime() + intervalMinutes * 60_000);
  if (next.getTime() <= Date.now()) return "Due now (waits for worker schedule tick)";

  return <LocalDateTime iso={next.toISOString()} />;
}

export function SyncScheduleStatus({
  lastIngestIso,
  lastIngestAttemptIso,
  lastIngestError,
  intervalMinutes,
  scheduleText,
  reconnectHref,
}: Props) {
  return (
    <>
      Last sync:{" "}
      {lastIngestIso ? <LocalDateTime iso={lastIngestIso} /> : "Never"}
      {" · "}
      Next scheduled:{" "}
      {nextSyncDisplay(
        lastIngestIso,
        lastIngestAttemptIso,
        lastIngestError,
        intervalMinutes,
        reconnectHref,
      )}
      {" · "}
      Schedule: {scheduleText}
    </>
  );
}
