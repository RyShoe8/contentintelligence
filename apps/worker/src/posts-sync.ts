import type { Db } from "mongodb";
import {
  archiveAutoPostsForSignal,
  buildDealKey,
  CONTENT_ONLY_DEAL_KEY,
  CONTENT_ONLY_DEAL_METRICS,
  dealStrengthPct,
  dealsForPostEval,
  findPostByItemDeal,
  findVoiceForContentSignal,
  getContentSignal,
  getSignalItem,
  isContentOnlyPost,
  listPosts,
  listSignalItemsForPostSync,
  primarySocialCopy,
  resolveContentProviderName,
  upsertPost,
  withDbRetry,
  type DealMetrics,
  type Post,
  type SignalItem,
  type SignalItemFeedRow,
  type SocialPlatformId,
} from "@content-resourcer/db";
import {
  generateSocialCopiesForPlatforms,
  resolveDistributionPlatforms,
  type GenerateSocialPostOpts,
} from "./generate-social-post.js";
import { updateBrandMemoryFromCopies } from "./jobs/update-brand-memory.js";
import {
  resolveVoiceGenerationContext,
  type VoiceGenerationContext,
} from "./voice-generation-context.js";

export type PostsSyncResult = {
  created: number;
  updated: number;
  archived: number;
  skipped: number;
  regenerated?: number;
};

export type PostsSyncOptions = {
  forceRegenerate?: boolean;
};

type PostSyncItem = Pick<
  SignalItem,
  | "id"
  | "organization_id"
  | "content_signal_id"
  | "title"
  | "ai_summary"
  | "sender_from"
  | "source_name"
  | "email_sent_at"
  | "original_url"
  | "casino_name"
  | "deal_metrics"
  | "deals_found"
>;

type PostCopyBundle = {
  social_copy: string;
  social_copy_by_platform: Partial<Record<SocialPlatformId, string>>;
  allCopies: string[];
};

function asPostSyncItem(item: SignalItemFeedRow): PostSyncItem {
  return item;
}

function voiceCopyOpts(ctx: VoiceGenerationContext) {
  return {
    brandName: ctx.brandName,
    brandMentionLevel: ctx.brandMentionLevel,
    sourcesInPostsLevel: ctx.sourcesInPostsLevel,
    preferredPhrases: ctx.preferredPhrases,
    persona: ctx.persona,
    constraints: ctx.constraints,
  };
}

function copyOptsWithDealUrl(ctx: VoiceGenerationContext, dealUrl?: string | null) {
  return {
    ...voiceCopyOpts(ctx),
    dealUrl: dealUrl ?? undefined,
  };
}

function postHasCopy(existing: Post | null): boolean {
  if (!existing) return false;
  if (existing.social_copy?.trim()) return true;
  return Object.values(existing.social_copy_by_platform ?? {}).some((v) => v?.trim());
}

async function generatePostCopies(
  ctx: VoiceGenerationContext,
  base: Omit<GenerateSocialPostOpts, "platform">,
): Promise<PostCopyBundle> {
  const platforms = resolveDistributionPlatforms(ctx.distributionPlatforms);
  const byPlatform = await generateSocialCopiesForPlatforms(platforms, {
    ...voiceCopyOpts(ctx),
    ...base,
  });
  const allCopies = platforms.map((p) => byPlatform[p]?.trim()).filter((v): v is string => !!v);
  const social_copy = primarySocialCopy(byPlatform, undefined, platforms);
  return { social_copy, social_copy_by_platform: byPlatform, allCopies };
}

async function regenerateAllDraftPostsForContentSignal(
  contentSignalId: string,
  ctx: VoiceGenerationContext,
  signalName: string,
): Promise<{ count: number; copies: string[] }> {
  const { signal, drafts, signalItemById } = await withDbRetry(async (db) => {
    const signal = await getContentSignal(db, contentSignalId);
    if (!signal) {
      return { signal: null, drafts: [] as Post[], signalItemById: new Map<string, SignalItem>() };
    }

    const drafts = await listPosts(db, {
      organizationId: signal.organization_id,
      content_signal_id: contentSignalId,
      status: "draft",
      limit: 500,
    });

    const signalItemIds = [...new Set(drafts.map((p) => p.signal_item_id))];
    const signalItems = await Promise.all(signalItemIds.map((id) => getSignalItem(db, id)));
    const signalItemById = new Map(signalItems.filter(Boolean).map((item) => [item!.id, item!]));
    return { signal, drafts, signalItemById };
  });

  if (!signal) return { count: 0, copies: [] };

  const copies: string[] = [];
  let count = 0;

  for (const post of drafts) {
    const contentOnly = isContentOnlyPost(post.deal_key, post.deal_metrics);
    const dealUrl = signalItemById.get(post.signal_item_id)?.original_url;
    const item = signalItemById.get(post.signal_item_id);
    const bundle = await generatePostCopies(ctx, {
      title: post.title,
      summary: post.ai_summary,
      senderFrom: post.sender_from,
      contentProviderName: item ? resolveContentProviderName(item) ?? undefined : undefined,
      deal: contentOnly ? undefined : post.deal_metrics,
      signalName,
      ...copyOptsWithDealUrl(ctx, dealUrl),
    });

    await withDbRetry((db) =>
      upsertPost(db, {
        organization_id: post.organization_id,
        content_signal_id: post.content_signal_id,
        signal_item_id: post.signal_item_id,
        deal_key: post.deal_key,
        source: post.source,
        title: post.title,
        social_copy: bundle.social_copy,
        social_copy_by_platform: bundle.social_copy_by_platform,
        deal_metrics: post.deal_metrics,
        source_name: post.source_name,
        sender_from: post.sender_from,
        email_sent_at: post.email_sent_at,
        ai_summary: post.ai_summary,
      }),
    );
    copies.push(...bundle.allCopies);
    count++;
  }

  return { count, copies };
}

async function upsertDealPost(opts: {
  item: PostSyncItem;
  deal: DealMetrics;
  source: "auto" | "manual";
  signalName: string;
  ctx: VoiceGenerationContext;
  forceRegenerate?: boolean;
}): Promise<{ outcome: "created" | "updated" | "skipped"; socialCopies?: string[] }> {
  const { item, deal, source, signalName, ctx, forceRegenerate } = opts;
  const dealKey = buildDealKey(deal);
  const existing = await withDbRetry((db) => findPostByItemDeal(db, item.id, dealKey));

  let bundle: PostCopyBundle | null = null;
  if (!postHasCopy(existing) || forceRegenerate) {
    bundle = await generatePostCopies(ctx, {
      title: item.title,
      summary: item.ai_summary,
      senderFrom: item.sender_from,
      contentProviderName: resolveContentProviderName(item) ?? undefined,
      deal,
      signalName,
      ...copyOptsWithDealUrl(ctx, item.original_url),
    });
  }

  const social_copy =
    bundle?.social_copy ?? existing?.social_copy ?? primarySocialCopy(existing?.social_copy_by_platform ?? {});
  const social_copy_by_platform =
    bundle?.social_copy_by_platform ?? existing?.social_copy_by_platform ?? {};

  const { created } = await withDbRetry((db) =>
    upsertPost(db, {
      organization_id: item.organization_id,
      content_signal_id: item.content_signal_id,
      signal_item_id: item.id,
      deal_key: dealKey,
      source,
      title: item.title,
      social_copy,
      social_copy_by_platform,
      deal_metrics: deal,
      source_name: item.source_name,
      sender_from: item.sender_from,
      email_sent_at: item.email_sent_at,
      ai_summary: item.ai_summary,
    }),
  );

  const regenerated = !postHasCopy(existing) || forceRegenerate;
  return {
    outcome: created ? "created" : "updated",
    socialCopies: regenerated ? bundle?.allCopies : undefined,
  };
}

async function upsertContentOnlyPost(opts: {
  item: PostSyncItem;
  signalName: string;
  ctx: VoiceGenerationContext;
  forceRegenerate?: boolean;
}): Promise<{ outcome: "created" | "updated" | "skipped"; socialCopies?: string[] }> {
  const { item, signalName, ctx, forceRegenerate } = opts;
  const existing = await withDbRetry((db) => findPostByItemDeal(db, item.id, CONTENT_ONLY_DEAL_KEY));

  let bundle: PostCopyBundle | null = null;
  if (!postHasCopy(existing) || forceRegenerate) {
    bundle = await generatePostCopies(ctx, {
      title: item.title,
      summary: item.ai_summary,
      senderFrom: item.sender_from,
      contentProviderName: resolveContentProviderName(item) ?? undefined,
      signalName,
      ...copyOptsWithDealUrl(ctx, item.original_url),
    });
  }

  const social_copy =
    bundle?.social_copy ?? existing?.social_copy ?? primarySocialCopy(existing?.social_copy_by_platform ?? {});
  const social_copy_by_platform =
    bundle?.social_copy_by_platform ?? existing?.social_copy_by_platform ?? {};

  const { created } = await withDbRetry((db) =>
    upsertPost(db, {
      organization_id: item.organization_id,
      content_signal_id: item.content_signal_id,
      signal_item_id: item.id,
      deal_key: CONTENT_ONLY_DEAL_KEY,
      source: "manual",
      title: item.title,
      social_copy,
      social_copy_by_platform,
      deal_metrics: CONTENT_ONLY_DEAL_METRICS,
      source_name: item.source_name,
      sender_from: item.sender_from,
      email_sent_at: item.email_sent_at,
      ai_summary: item.ai_summary,
    }),
  );

  const regenerated = !postHasCopy(existing) || forceRegenerate;
  return {
    outcome: created ? "created" : "updated",
    socialCopies: regenerated ? bundle?.allCopies : undefined,
  };
}

export async function syncPostsForContentSignal(
  db: Db,
  contentSignalId: string,
  opts?: PostsSyncOptions,
): Promise<PostsSyncResult> {
  const forceRegenerate = opts?.forceRegenerate ?? false;
  const signal = await getContentSignal(db, contentSignalId);
  if (!signal) {
    return { created: 0, updated: 0, archived: 0, skipped: 0 };
  }

  const minPct = (signal.post_min_deal_pct ?? 50) / 100;
  const voice = await findVoiceForContentSignal(db, contentSignalId);
  const ctx = resolveVoiceGenerationContext(voice);
  const items = await listSignalItemsForPostSync(db, {
    organizationId: signal.organization_id,
    content_signal_id: contentSignalId,
    max_age_hours: signal.lookback_window_hours,
    sort: "created_at",
    order: "desc",
    limit: 500,
  });

  const result: PostsSyncResult = { created: 0, updated: 0, archived: 0, skipped: 0 };
  const keepKeys = new Set<string>();
  const newCopies: string[] = [];

  for (const row of items) {
    const item = asPostSyncItem(row);
    const deals = dealsForPostEval(item);
    if (!deals.length) {
      result.skipped++;
      continue;
    }

    for (const deal of deals) {
      if (dealStrengthPct(deal) < minPct) continue;

      const dealKey = buildDealKey(deal);
      keepKeys.add(`${item.id}:${dealKey}`);

      const { outcome, socialCopies } = await upsertDealPost({
        item,
        deal,
        source: "auto",
        signalName: signal.name,
        ctx,
        forceRegenerate,
      });
      if (socialCopies?.length) newCopies.push(...socialCopies);
      if (outcome === "created") result.created++;
      else if (outcome === "updated") result.updated++;
      else result.skipped++;
    }
  }

  result.archived = await withDbRetry((innerDb) =>
    archiveAutoPostsForSignal(innerDb, contentSignalId, keepKeys),
  );

  if (forceRegenerate) {
    const regen = await regenerateAllDraftPostsForContentSignal(contentSignalId, ctx, signal.name);
    result.regenerated = regen.count;
    newCopies.push(...regen.copies);
  }

  if (ctx.voiceId && newCopies.length) {
    await withDbRetry((innerDb) => updateBrandMemoryFromCopies(innerDb, ctx.voiceId!, newCopies));
  }

  return result;
}

export async function addPostsForSignalItem(
  db: Db,
  signalItemId: string,
  dealIndex?: number,
): Promise<PostsSyncResult & { posts: Post[] }> {
  const item = await getSignalItem(db, signalItemId);
  if (!item) {
    return { created: 0, updated: 0, archived: 0, skipped: 0, posts: [] };
  }

  const syncItem = asPostSyncItem(item);
  const signal = await getContentSignal(db, item.content_signal_id);
  const signalName = signal?.name ?? "Content signal";
  const voice = await findVoiceForContentSignal(db, item.content_signal_id);
  const ctx = resolveVoiceGenerationContext(voice);
  const deals = dealsForPostEval(item);

  if (!deals.length) {
    const result: PostsSyncResult = { created: 0, updated: 0, archived: 0, skipped: 0 };
    const { outcome, socialCopies } = await upsertContentOnlyPost({
      item: syncItem,
      signalName,
      ctx,
      forceRegenerate: true,
    });
    const newCopies: string[] = socialCopies ?? [];
    if (outcome === "created") result.created++;
    else if (outcome === "updated") result.updated++;
    else result.skipped++;

    const post = await withDbRetry((innerDb) =>
      findPostByItemDeal(innerDb, item.id, CONTENT_ONLY_DEAL_KEY),
    );
    const posts = post ? [post] : [];

    if (ctx.voiceId && newCopies.length) {
      await withDbRetry((innerDb) => updateBrandMemoryFromCopies(innerDb, ctx.voiceId!, newCopies));
    }

    return { ...result, posts };
  }

  const targets =
    dealIndex != null && dealIndex >= 0 && dealIndex < deals.length ? [deals[dealIndex]!] : deals;

  const result: PostsSyncResult = { created: 0, updated: 0, archived: 0, skipped: 0 };
  const posts: Post[] = [];
  const newCopies: string[] = [];

  for (const deal of targets) {
    const { outcome, socialCopies } = await upsertDealPost({
      item: syncItem,
      deal,
      source: "manual",
      signalName,
      ctx,
      forceRegenerate: true,
    });
    if (socialCopies?.length) newCopies.push(...socialCopies);
    if (outcome === "created") result.created++;
    else if (outcome === "updated") result.updated++;
    else result.skipped++;

    const dealKey = buildDealKey(deal);
    const post = await withDbRetry((innerDb) => findPostByItemDeal(innerDb, item.id, dealKey));
    if (post) posts.push(post);
  }

  if (ctx.voiceId && newCopies.length) {
    await withDbRetry((innerDb) => updateBrandMemoryFromCopies(innerDb, ctx.voiceId!, newCopies));
  }

  return { ...result, posts };
}
