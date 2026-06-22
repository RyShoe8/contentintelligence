import { runScheduleTickFetch, resolveCronIngestDueHttpStatus } from "@/lib/schedule-tick-fetch";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

function workerHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.INGEST_SECRET) {
    headers["x-ingest-secret"] = process.env.INGEST_SECRET;
  }
  return headers;
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({ error: "WORKER_URL is not configured" }, { status: 500 });
  }

  const result = await runScheduleTickFetch({
    workerBase: base,
    headers: workerHeaders(),
  });

  if (result.error) {
    return NextResponse.json(
      {
        cron: true,
        tick_attempts: result.tick_attempts,
        worker_wake_ms: result.worker_wake_ms,
        worker_wake_ok: result.worker_wake_ok,
        schedule_tick_status: result.schedule_tick_status,
        schedule_tick_ms: result.schedule_tick_ms,
        error: result.error,
      },
      { status: 502 },
    );
  }

  const httpStatus = resolveCronIngestDueHttpStatus(
    result.schedule_tick_status,
    result.body,
  );

  return NextResponse.json(
    {
      cron: true,
      tick_attempts: result.tick_attempts,
      worker_wake_ms: result.worker_wake_ms,
      worker_wake_ok: result.worker_wake_ok,
      schedule_tick_status: result.schedule_tick_status,
      schedule_tick_ms: result.schedule_tick_ms,
      accepted: result.accepted,
      due_count: result.due_count,
      content_signal_id: result.content_signal_id,
      ...(httpStatus === 200 &&
      result.schedule_tick_status === 409 &&
      result.body.error === "ingest_already_running"
        ? { skipped: "ingest_already_running" as const }
        : {}),
      ...result.body,
    },
    { status: httpStatus },
  );
}
