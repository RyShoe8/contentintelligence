"use client";

import type { ReactNode } from "react";
import { LocalDateTime } from "@/components/local-date-time";

const OVERDUE_GRACE_MS = 30 * 60_000;

type Props = {
  lastIngestIso: string | null;
  lastIngestAttemptIso?: string | null;
  lastIngestError?: string | null;
  intervalMinutes: number | null;
  scheduleText: string;
  reconnectHref?: string;
};

export function isScheduleSyncOverdue(
  lastIngestIso: string | null,
  intervalMinutes: number | null,
  nowMs = Date.now(),
): boolean {
  if (intervalMinutes == null || intervalMinutes <= 0) return false;
  if (!lastIngestIso) return true;

  const last = new Date(lastIngestIso);
  if (!Number.isFinite(last.getTime())) return true;

  const dueAt = last.getTime() + intervalMinutes * 60_000;
  return nowMs - dueAt >= OVERDUE_GRACE_MS;
}

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
  const overdue = isScheduleSyncOverdue(lastIngestIso, intervalMinutes);

  return (
    <>
      <span className="block">
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
      </span>
      {overdue &&
      !attemptFailedAfterLastSuccess(
        lastIngestIso,
        lastIngestAttemptIso,
        lastIngestError,
      ) ? (
        <span className="mt-1 block text-amber-200/90">
          Scheduled sync is overdue. Automatic sync requires Vercel cron or an external job
          (e.g. cron-job.org) to call{" "}
          <code className="text-[var(--fg)]">/api/cron/ingest-due</code> with{" "}
          <code className="text-[var(--fg)]">CRON_SECRET</code>. See the README Feed sync
          schedule section.
        </span>
      ) : null}
    </>
  );
}
