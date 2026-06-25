import {
  getWriterArticle,
  isMongoNetworkError,
  writerComposeStatusPayload,
} from "@content-resourcer/db";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withFreshMongo } from "@/lib/mongo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "writer_article_id required" }, { status: 400 });
  }

  const orgId = session.user.organizationId;

  try {
    const article = await withFreshMongo(async (db) => {
      const row = await getWriterArticle(db, id.trim(), orgId);
      if (!row || row.mode !== "compose") return null;
      return row;
    });

    if (!article) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json(writerComposeStatusPayload(article));
  } catch (e) {
    console.error("[api/writer/compose-status]", e);
    if (isMongoNetworkError(e)) {
      return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
    }
    const message = e instanceof Error ? e.message : "compose_status_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
