import { getVoice, writerComposeInputSchema } from "@content-resourcer/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/mongo";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = session.user.organizationId;
  const email = session.user.email;
  if (!orgId || !email) {
    return NextResponse.json({ error: "no_organization" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = writerComposeInputSchema.safeParse({
    voice_id: body.voice_id,
    topic: body.topic,
    reference_urls: body.reference_urls ?? [],
    links: body.links ?? [],
    writer_article_id: body.writer_article_id,
    deep_research: body.deep_research,
    web_search: body.web_search,
    web_search_max_queries: body.web_search_max_queries,
    web_search_max_results: body.web_search_max_results,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "invalid_input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const db = await connectMongo();
  const voice = await getVoice(db, parsed.data.voice_id);
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

  const r = await fetch(`${base}/writer/compose`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...parsed.data,
      organization_id: orgId,
      created_by: email,
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
