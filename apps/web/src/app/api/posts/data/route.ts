import {
  findVoiceForContentSignal,
  getSignalPostDisplayRowsByIds,
  listContentSignals,
  listPosts,
  type ContentSignal,
  type Post,
  type SignalItemPostDisplayRow,
  type Voice,
} from "@content-resourcer/db";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { ContentSignalSourceOAuth } from "@/components/content-signal-gmail-auth-alerts";
import type { PostsDataResponseJson } from "@/lib/posts-data";
import { loadContentSignalGmailOAuth } from "@/lib/content-signal-gmail-oauth";
import { withFreshMongo } from "@/lib/mongo";

export const maxDuration = 60;

function serializeContentSignal(cs: ContentSignal) {
  return {
    ...cs,
    last_ingest_completed_at: cs.last_ingest_completed_at?.toISOString() ?? null,
    last_ingest_attempt_at: cs.last_ingest_attempt_at?.toISOString() ?? null,
    created_at: cs.created_at.toISOString(),
    updated_at: cs.updated_at.toISOString(),
  };
}

function serializePostDisplayRow(item: SignalItemPostDisplayRow) {
  return {
    ...item,
    email_sent_at: item.email_sent_at?.toISOString(),
    created_at: item.created_at.toISOString(),
  };
}

function serializePost(post: Post) {
  return {
    ...post,
    email_sent_at: post.email_sent_at?.toISOString(),
    image_generated_at: post.image_generated_at?.toISOString(),
    created_at: post.created_at.toISOString(),
    updated_at: post.updated_at.toISOString(),
  };
}

function serializeVoice(voice: Voice) {
  return {
    ...voice,
    persona_generated_at: voice.persona_generated_at?.toISOString(),
    persona_requested_at: voice.persona_requested_at?.toISOString(),
    style_examples_synced_at: voice.style_examples_synced_at?.toISOString(),
    created_at: voice.created_at.toISOString(),
    updated_at: voice.updated_at.toISOString(),
  };
}

function serializeGmailOAuthSource(source: ContentSignalSourceOAuth) {
  return {
    ...source,
    refreshTokenIssuedAt: source.refreshTokenIssuedAt?.toISOString() ?? null,
    updatedAt: source.updatedAt?.toISOString() ?? null,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  const orgId = session?.user?.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const contentSignalId = new URL(req.url).searchParams.get("content_signal_id")?.trim();

  try {
    const payload = await withFreshMongo(async (db) => {
      const contentSignals = await listContentSignals(db, { organizationId: orgId });
      const selectedId = contentSignalId || contentSignals[0]?.id || "";
      const selectedSignal = contentSignals.find((cs) => cs.id === selectedId) ?? null;

      if (!selectedId) {
        return {
          contentSignals,
          selectedId,
          selectedSignal,
          linkedVoice: null as Voice | null,
          posts: [] as Post[],
          signalItemsById: new Map<string, SignalItemPostDisplayRow>(),
          gmailOAuthSources: [] as ContentSignalSourceOAuth[],
        };
      }

      const linkedVoice = await findVoiceForContentSignal(db, selectedId);
      const posts = await listPosts(db, {
        organizationId: orgId,
        content_signal_id: selectedId,
        status: "draft",
      });

      const signalItemsById = await getSignalPostDisplayRowsByIds(
        db,
        orgId,
        posts.map((p) => p.signal_item_id),
      );

      let gmailOAuthSources: ContentSignalSourceOAuth[] = [];
      try {
        gmailOAuthSources = await loadContentSignalGmailOAuth(db, selectedId);
      } catch {
        // Non-critical: OAuth alerts only.
      }

      return {
        contentSignals,
        selectedId,
        selectedSignal,
        linkedVoice,
        posts,
        signalItemsById,
        gmailOAuthSources,
      };
    });

    const signalItemsById: Record<string, ReturnType<typeof serializePostDisplayRow>> = {};
    for (const [id, row] of payload.signalItemsById) {
      signalItemsById[id] = serializePostDisplayRow(row);
    }

    const body: PostsDataResponseJson = {
      contentSignals: payload.contentSignals.map(serializeContentSignal),
      selectedId: payload.selectedId,
      selectedSignal: payload.selectedSignal
        ? serializeContentSignal(payload.selectedSignal)
        : null,
      linkedVoice: payload.linkedVoice ? serializeVoice(payload.linkedVoice) : null,
      posts: payload.posts.map(serializePost),
      signalItemsById,
      gmailOAuthSources: payload.gmailOAuthSources.map(serializeGmailOAuthSource),
    };

    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "posts_data_failed";
    console.error("[api/posts/data]", e);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
