import { getVoice, isMongoNetworkError } from "@content-resourcer/db";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withFreshMongo } from "@/lib/mongo";

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

  const orgId = session.user.organizationId;

  try {
    const voice = await withFreshMongo(async (db) => {
      const row = await getVoice(db, voiceId.trim());
      if (!row || row.organization_id !== orgId) return null;
      return row;
    });

    if (!voice) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      persona_status: voice.persona_status,
      persona_error: voice.persona_error ?? undefined,
      persona_generated_at: voice.persona_generated_at?.toISOString(),
      persona_requested_at: voice.persona_requested_at?.toISOString(),
      ...(voice.persona_status === "ready" ? { persona: voice.persona } : {}),
    });
  } catch (e) {
    console.error("[api/voices/persona-status]", e);
    if (isMongoNetworkError(e)) {
      return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
    }
    const message = e instanceof Error ? e.message : "persona_status_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
