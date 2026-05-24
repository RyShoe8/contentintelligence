"use client";

import type { ReactNode } from "react";
import { LocalDateTime } from "@/components/local-date-time";

type Props = {
  lastIngestIso: string | null;
  intervalMinutes: number | null;
  scheduleText: string;
};

function nextSyncDisplay(lastIngestIso: string | null, intervalMinutes: number | null): ReactNode {
  if (intervalMinutes == null || intervalMinutes <= 0) return "Not scheduled";
  if (!lastIngestIso) return "Due on next schedule tick";

  const last = new Date(lastIngestIso);
  if (!Number.isFinite(last.getTime())) return "Due on next schedule tick";

  const next = new Date(last.getTime() + intervalMinutes * 60_000);
  if (next.getTime() <= Date.now()) return "Due now (waits for worker schedule tick)";

  return <LocalDateTime iso={next.toISOString()} />;
}

export function SyncScheduleStatus({ lastIngestIso, intervalMinutes, scheduleText }: Props) {
  return (
    <>
      Last sync:{" "}
      {lastIngestIso ? <LocalDateTime iso={lastIngestIso} /> : "Never"}
      {" · "}
      Next scheduled: {nextSyncDisplay(lastIngestIso, intervalMinutes)}
      {" · "}
      Schedule: {scheduleText}
    </>
  );
}
