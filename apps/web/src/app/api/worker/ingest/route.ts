import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { content_signal_id?: string };
  const contentSignalId = body.content_signal_id?.trim();
  if (!contentSignalId) {
    return NextResponse.json({ error: "content_signal_id is required" }, { status: 400 });
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
      return NextResponse.json(
        {
          error:
            typeof parsed === "object" && parsed && "error" in parsed
              ? (parsed as { error: string }).error
              : text,
        },
        { status: r.status },
      );
    }
    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
