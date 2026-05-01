/** Grep-friendly ingest logs; never pass tokens or secrets in payload. */
export function ingestVerbose(): boolean {
  const v = process.env.INGEST_LOG_VERBOSE;
  return v === "1" || v === "true";
}

export function ingestLog(step: string, payload: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ step, ...payload });
  console.log(`[ingest] ${line}`);
}
