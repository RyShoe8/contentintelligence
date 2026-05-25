import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({ error: "WORKER_URL is not configured" }, { status: 500 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.INGEST_SECRET) {
    headers["x-ingest-secret"] = process.env.INGEST_SECRET;
  }

  try {
    const r = await fetch(`${base}/schedule/tick`, { method: "POST", headers });
    const text = await r.text();
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
    return NextResponse.json(body, { status: r.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
