import { getWriterArticle, writerComposeStatusPayload } from "@content-resourcer/db";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/mongo";

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

  const db = await connectMongo();
  const article = await getWriterArticle(db, id.trim(), session.user.organizationId);
  if (!article || article.mode !== "compose") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json(writerComposeStatusPayload(article));
}
