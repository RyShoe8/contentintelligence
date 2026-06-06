import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/mongo";
import { getVoice } from "@content-resourcer/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = session.user.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "no_organization" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const voiceId = String(body.voice_id ?? "").trim();
  const html = String(body.html ?? "").trim();
  if (!voiceId || !html) {
    return NextResponse.json({ error: "voice_id and html are required" }, { status: 400 });
  }

  const db = await connectMongo();
  const voice = await getVoice(db, voiceId);
  if (!voice || voice.organization_id !== orgId) {
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

  const r = await fetch(`${base}/writer/fingerprints`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      voice_id: voiceId,
      organization_id: orgId,
      html,
    }),
  });

  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const err =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : text;
    return NextResponse.json({ error: err }, { status: r.status });
  }
  return NextResponse.json(data, { status: r.status });
}
