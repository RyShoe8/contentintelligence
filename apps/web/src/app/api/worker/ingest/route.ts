import { getContentSignal } from "@content-resourcer/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sanitizeIngestError } from "@/lib/ingest-response";
import { connectMongo } from "@/lib/mongo";
import { canAccessContentSignal } from "@/lib/org-auth";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.organizationId) {
    return NextResponse.json({ error: "no_organization" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { content_signal_id?: string };
  const contentSignalId = body.content_signal_id?.trim();
  if (!contentSignalId) {
    return NextResponse.json({ error: "content_signal_id is required" }, { status: 400 });
  }

  const db = await connectMongo();
  const cs = await getContentSignal(db, contentSignalId);
  if (!cs || !canAccessContentSignal(cs, session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
    const url = `${base}/ingest?content_signal_id=${encodeURIComponent(contentSignalId)}`;
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ content_signal_id: contentSignalId }),
    });
    const text = await r.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { raw: text };
    }
    if (!r.ok) {
      const rawErr =
        typeof parsed === "object" && parsed && "message" in parsed
          ? (parsed as { message: string }).message
          : typeof parsed === "object" && parsed && "error" in parsed
            ? (parsed as { error: string }).error
            : text;
      return NextResponse.json({ error: sanitizeIngestError(rawErr) }, { status: r.status });
    }
    return NextResponse.json(parsed, { status: r.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
