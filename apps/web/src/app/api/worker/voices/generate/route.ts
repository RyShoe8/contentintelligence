import { getVoice } from "@content-resourcer/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/mongo";

async function forwardToWorker(path: string, query: Record<string, string>) {
  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({ error: "WORKER_URL is not configured" }, { status: 500 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.INGEST_SECRET) {
    headers["x-ingest-secret"] = process.env.INGEST_SECRET;
  }

  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }

  const r = await fetch(url.toString(), { method: "POST", headers });
  const text = await r.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!r.ok) {
    const err =
      typeof parsed === "object" && parsed && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : text;
    return NextResponse.json({ error: err }, { status: r.status });
  }
  return NextResponse.json(parsed, { status: r.status });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.organizationId) {
    return NextResponse.json({ error: "no_organization" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { voice_id?: string };
  const voiceId = body.voice_id?.trim();
  if (!voiceId) {
    return NextResponse.json({ error: "voice_id is required" }, { status: 400 });
  }

  const db = await connectMongo();
  const voice = await getVoice(db, voiceId);
  if (!voice || voice.organization_id !== session.user.organizationId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return forwardToWorker("/voices/generate", { voice_id: voiceId });
}
