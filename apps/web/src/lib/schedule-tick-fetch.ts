export const TICK_FETCH_TIMEOUT_MS = 25_000;
export const TICK_RETRY_DELAY_MS = 12_000;
export const HEALTH_FETCH_TIMEOUT_MS = 8_000;
export const MAX_TICK_ATTEMPTS = 2;

export type ScheduleTickFetchOpts = {
  workerBase: string;
  headers: Record<string, string>;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  tickTimeoutMs?: number;
  tickRetryDelayMs?: number;
  healthTimeoutMs?: number;
  maxTickAttempts?: number;
};

export type ScheduleTickFetchResult = {
  tick_attempts: number;
  worker_wake_ms: number;
  worker_wake_ok: boolean;
  schedule_tick_ms: number;
  schedule_tick_status: number | null;
  accepted?: boolean;
  due_count?: number;
  content_signal_id?: string | null;
  skipped?: "worker_timeout";
  body: Record<string, unknown>;
  error?: string;
};

/** Map worker schedule/tick HTTP status to cron route response status. */
export function resolveCronIngestDueHttpStatus(
  scheduleTickStatus: number | null,
  body: Record<string, unknown>,
  fetchError?: string,
): number {
  if (fetchError && isWorkerTimeoutError(fetchError)) {
    return 200;
  }
  if (
    scheduleTickStatus === 409 &&
    body.error === "ingest_already_running"
  ) {
    return 200;
  }
  if (scheduleTickStatus != null && scheduleTickStatus >= 400) {
    return scheduleTickStatus;
  }
  return 200;
}

function isWorkerTimeoutError(message: string): boolean {
  return (
    /AbortError/i.test(message) ||
    /TimeoutError/i.test(message) ||
    /timed out/i.test(message) ||
    /fetch failed/i.test(message)
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkFetchError(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  const name = e.name;
  return (
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "TypeError" ||
    /fetch failed/i.test(e.message)
  );
}

async function tryHealthWake(
  workerBase: string,
  fetchFn: typeof fetch,
  healthTimeoutMs: number,
): Promise<{ ok: boolean; ms: number }> {
  const started = Date.now();
  try {
    const r = await fetchFn(`${workerBase}/health`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(healthTimeoutMs),
    });
    return { ok: r.ok, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  }
}

async function tryScheduleTick(
  workerBase: string,
  headers: Record<string, string>,
  fetchFn: typeof fetch,
  tickTimeoutMs: number,
): Promise<{
  networkError?: string;
  status: number;
  ms: number;
  body: Record<string, unknown>;
}> {
  const started = Date.now();
  try {
    const r = await fetchFn(`${workerBase}/schedule/tick`, {
      method: "POST",
      headers,
      body: "{}",
      signal: AbortSignal.timeout(tickTimeoutMs),
    });
    const text = await r.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { raw: text };
    }
    const body =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : { result: parsed };
    return { status: r.status, ms: Date.now() - started, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return {
      networkError: msg,
      status: 0,
      ms: Date.now() - started,
      body: {},
    };
  }
}

export async function runScheduleTickFetch(
  opts: ScheduleTickFetchOpts,
): Promise<ScheduleTickFetchResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleepFn = opts.sleepFn ?? defaultSleep;
  const tickTimeoutMs = opts.tickTimeoutMs ?? TICK_FETCH_TIMEOUT_MS;
  const tickRetryDelayMs = opts.tickRetryDelayMs ?? TICK_RETRY_DELAY_MS;
  const healthTimeoutMs = opts.healthTimeoutMs ?? HEALTH_FETCH_TIMEOUT_MS;
  const maxAttempts = opts.maxTickAttempts ?? MAX_TICK_ATTEMPTS;

  let workerWakeMs = 0;
  let workerWakeOk = false;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const wake = await tryHealthWake(opts.workerBase, fetchFn, healthTimeoutMs);
      workerWakeMs += wake.ms;
      workerWakeOk = workerWakeOk || wake.ok;
      await sleepFn(tickRetryDelayMs);
    }

    const tick = await tryScheduleTick(opts.workerBase, opts.headers, fetchFn, tickTimeoutMs);
    if (!tick.networkError) {
      const accepted =
        typeof tick.body.accepted === "boolean" ? tick.body.accepted : undefined;
      const due_count =
        typeof tick.body.due_count === "number" ? tick.body.due_count : undefined;
      const content_signal_id =
        typeof tick.body.content_signal_id === "string" ||
        tick.body.content_signal_id === null
          ? (tick.body.content_signal_id as string | null)
          : undefined;

      return {
        tick_attempts: attempt,
        worker_wake_ms: workerWakeMs,
        worker_wake_ok: workerWakeOk,
        schedule_tick_ms: tick.ms,
        schedule_tick_status: tick.status,
        accepted,
        due_count,
        content_signal_id,
        body: tick.body,
      };
    }

    lastError = tick.networkError;
    if (!isNetworkFetchError(new Error(tick.networkError))) {
      break;
    }
  }

  return {
    tick_attempts: maxAttempts,
    worker_wake_ms: workerWakeMs,
    worker_wake_ok: workerWakeOk,
    schedule_tick_ms: 0,
    schedule_tick_status: null,
    skipped: lastError && isWorkerTimeoutError(lastError) ? "worker_timeout" : undefined,
    body: lastError && isWorkerTimeoutError(lastError) ? { skipped: "worker_timeout" } : {},
    error: lastError ?? "fetch_failed",
  };
}
