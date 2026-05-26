import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const WAKE_ATTEMPTS = 3;
const WAKE_RETRY_DELAY_MS = 15_000;
const WAKE_FETCH_TIMEOUT_MS = 25_000;
const TICK_FETCH_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function wakeWorker(base: string): Promise<{ ok: boolean; worker_wake_ms: number; attempts: number }> {
  const wakeStarted = Date.now();
  for (let attempt = 1; attempt <= WAKE_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(`${base}/health`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(WAKE_FETCH_TIMEOUT_MS),
      });
      if (r.ok) {
        return { ok: true, worker_wake_ms: Date.now() - wakeStarted, attempts: attempt };
      }
    } catch {
      // Render cold start may fail the first request; retry after delay.
    }
    if (attempt < WAKE_ATTEMPTS) {
      await sleep(WAKE_RETRY_DELAY_MS);
    }
  }
  return { ok: false, worker_wake_ms: Date.now() - wakeStarted, attempts: WAKE_ATTEMPTS };
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({ error: "WORKER_URL is not configured" }, { status: 500 });
  }

  const headers = workerHeaders();
  const wake = await wakeWorker(base);

  try {
    const tickStarted = Date.now();
    const r = await fetch(`${base}/schedule/tick`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(TICK_FETCH_TIMEOUT_MS),
    });
    const schedule_tick_ms = Date.now() - tickStarted;
    const text = await r.text();
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
    return NextResponse.json(
      {
        worker_wake_ms: wake.worker_wake_ms,
        worker_wake_attempts: wake.attempts,
        worker_wake_ok: wake.ok,
        schedule_tick_status: r.status,
        schedule_tick_ms,
        ...(typeof body === "object" && body !== null ? body : { result: body }),
      },
      { status: r.status },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return NextResponse.json(
      {
        error: msg,
        worker_wake_ms: wake.worker_wake_ms,
        worker_wake_attempts: wake.attempts,
        worker_wake_ok: wake.ok,
        schedule_tick_status: null,
      },
      { status: 502 },
    );
  }
}
