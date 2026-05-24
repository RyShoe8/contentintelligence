import { getVoice } from "@content-resourcer/db";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/mongo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ voiceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { voiceId } = await params;
  if (!voiceId?.trim()) {
    return NextResponse.json({ error: "voice_id required" }, { status: 400 });
  }

  const db = await connectMongo();
  const voice = await getVoice(db, voiceId.trim());
  if (!voice || voice.organization_id !== session.user.organizationId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    persona_status: voice.persona_status,
    persona_error: voice.persona_error ?? undefined,
    persona_generated_at: voice.persona_generated_at?.toISOString(),
  });
}
