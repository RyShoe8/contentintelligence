import type { ContentSignal, Post, SignalItemPostDisplayRow, Voice } from "@content-resourcer/db/schemas";
import type { ContentSignalSourceOAuth } from "@/components/content-signal-gmail-auth-alerts";

export type PostsSearchParams = {
  content_signal_id?: string;
};

type SerializedContentSignal = Omit<
  ContentSignal,
  "last_ingest_completed_at" | "last_ingest_attempt_at" | "created_at" | "updated_at"
> & {
  last_ingest_completed_at?: string | null;
  last_ingest_attempt_at?: string | null;
  created_at: string;
  updated_at: string;
};

type SerializedSignalItemPostDisplayRow = Omit<
  SignalItemPostDisplayRow,
  "email_sent_at" | "created_at"
> & {
  email_sent_at?: string;
  created_at: string;
};

type SerializedPost = Omit<
  Post,
  "email_sent_at" | "image_generated_at" | "created_at" | "updated_at"
> & {
  email_sent_at?: string;
  image_generated_at?: string;
  created_at: string;
  updated_at: string;
};

type SerializedVoice = Omit<
  Voice,
  | "persona_generated_at"
  | "persona_requested_at"
  | "style_examples_synced_at"
  | "created_at"
  | "updated_at"
> & {
  persona_generated_at?: string;
  persona_requested_at?: string;
  style_examples_synced_at?: string;
  created_at: string;
  updated_at: string;
};

type SerializedGmailOAuthSource = Omit<
  ContentSignalSourceOAuth,
  "refreshTokenIssuedAt" | "updatedAt"
> & {
  refreshTokenIssuedAt: string | null;
  updatedAt: string | null;
};

export type PostsDataResponseJson = {
  contentSignals: SerializedContentSignal[];
  selectedId: string;
  selectedSignal: SerializedContentSignal | null;
  linkedVoice: SerializedVoice | null;
  posts: SerializedPost[];
  signalItemsById: Record<string, SerializedSignalItemPostDisplayRow>;
  gmailOAuthSources: SerializedGmailOAuthSource[];
};

export type PostsDataLoaded = {
  contentSignals: ContentSignal[];
  selectedId: string;
  selectedSignal: ContentSignal | null;
  linkedVoice: Voice | null;
  posts: Post[];
  signalItemsById: Map<string, SignalItemPostDisplayRow>;
  gmailOAuthSources: ContentSignalSourceOAuth[];
};

export function postsDataQueryString(sp: PostsSearchParams): string {
  const qs = new URLSearchParams();
  if (sp.content_signal_id) qs.set("content_signal_id", sp.content_signal_id);
  return qs.toString();
}

export function parsePostsDataResponse(json: PostsDataResponseJson): PostsDataLoaded {
  const signalItemsById = new Map<string, SignalItemPostDisplayRow>();
  for (const [id, row] of Object.entries(json.signalItemsById)) {
    signalItemsById.set(id, parsePostDisplayRow(row));
  }
  return {
    contentSignals: json.contentSignals.map(parseContentSignal),
    selectedId: json.selectedId,
    selectedSignal: json.selectedSignal ? parseContentSignal(json.selectedSignal) : null,
    linkedVoice: json.linkedVoice ? parseVoice(json.linkedVoice) : null,
    posts: json.posts.map(parsePost),
    signalItemsById,
    gmailOAuthSources: json.gmailOAuthSources.map(parseGmailOAuthSource),
  };
}

function parseContentSignal(cs: SerializedContentSignal): ContentSignal {
  return {
    ...cs,
    last_ingest_completed_at: cs.last_ingest_completed_at
      ? new Date(cs.last_ingest_completed_at)
      : undefined,
    last_ingest_attempt_at: cs.last_ingest_attempt_at
      ? new Date(cs.last_ingest_attempt_at)
      : undefined,
    created_at: new Date(cs.created_at),
    updated_at: new Date(cs.updated_at),
  };
}

function parsePostDisplayRow(item: SerializedSignalItemPostDisplayRow): SignalItemPostDisplayRow {
  return {
    ...item,
    email_sent_at: item.email_sent_at ? new Date(item.email_sent_at) : undefined,
    created_at: new Date(item.created_at),
  };
}

function parsePost(post: SerializedPost): Post {
  return {
    ...post,
    email_sent_at: post.email_sent_at ? new Date(post.email_sent_at) : undefined,
    image_generated_at: post.image_generated_at ? new Date(post.image_generated_at) : undefined,
    created_at: new Date(post.created_at),
    updated_at: new Date(post.updated_at),
  };
}

function parseVoice(voice: SerializedVoice): Voice {
  return {
    ...voice,
    persona_generated_at: voice.persona_generated_at
      ? new Date(voice.persona_generated_at)
      : undefined,
    persona_requested_at: voice.persona_requested_at
      ? new Date(voice.persona_requested_at)
      : undefined,
    style_examples_synced_at: voice.style_examples_synced_at
      ? new Date(voice.style_examples_synced_at)
      : undefined,
    created_at: new Date(voice.created_at),
    updated_at: new Date(voice.updated_at),
  };
}

function parseGmailOAuthSource(source: SerializedGmailOAuthSource): ContentSignalSourceOAuth {
  return {
    ...source,
    refreshTokenIssuedAt: source.refreshTokenIssuedAt
      ? new Date(source.refreshTokenIssuedAt)
      : null,
    updatedAt: source.updatedAt ? new Date(source.updatedAt) : null,
  };
}

export async function fetchPostsData(
  sp: PostsSearchParams,
  attempt = 0,
): Promise<{ ok: true; data: PostsDataLoaded } | { ok: false; error: string }> {
  const qs = postsDataQueryString(sp);
  const retryDelays = [1000, 2000];

  try {
    const r = await fetch(`/api/posts/data?${qs}`, { cache: "no-store" });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      const message = body.error ?? `Posts data request failed (${r.status})`;
      if (attempt < retryDelays.length) {
        await sleep(retryDelays[attempt]);
        return fetchPostsData(sp, attempt + 1);
      }
      return { ok: false, error: message };
    }
    const json = (await r.json()) as PostsDataResponseJson;
    return { ok: true, data: parsePostsDataResponse(json) };
  } catch {
    if (attempt < retryDelays.length) {
      await sleep(retryDelays[attempt]);
      return fetchPostsData(sp, attempt + 1);
    }
    return { ok: false, error: "Could not load posts. Check your connection and try again." };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
