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
  listSignalItems,
  primarySocialCopy,
  upsertPost,
  type DealMetrics,
  type Post,
  type SignalItem,
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

type PostCopyBundle = {
  social_copy: string;
  social_copy_by_platform: Partial<Record<SocialPlatformId, string>>;
  allCopies: string[];
};

function voiceCopyOpts(ctx: VoiceGenerationContext) {
  return {
    brandName: ctx.brandName,
    brandMentionLevel: ctx.brandMentionLevel,
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
  db: Db,
  contentSignalId: string,
  ctx: VoiceGenerationContext,
  signalName: string,
): Promise<{ count: number; copies: string[] }> {
  const signal = await getContentSignal(db, contentSignalId);
  if (!signal) return { count: 0, copies: [] };

  const drafts = await listPosts(db, {
    organizationId: signal.organization_id,
    content_signal_id: contentSignalId,
    status: "draft",
    limit: 500,
  });

  const copies: string[] = [];
  let count = 0;
  const signalItemIds = [...new Set(drafts.map((p) => p.signal_item_id))];
  const signalItems = await Promise.all(signalItemIds.map((id) => getSignalItem(db, id)));
  const signalItemById = new Map(signalItems.filter(Boolean).map((item) => [item!.id, item!]));

  for (const post of drafts) {
    const contentOnly = isContentOnlyPost(post.deal_key, post.deal_metrics);
    const dealUrl = signalItemById.get(post.signal_item_id)?.original_url;
    const bundle = await generatePostCopies(ctx, {
      title: post.title,
      summary: post.ai_summary,
      senderFrom: post.sender_from,
      deal: contentOnly ? undefined : post.deal_metrics,
      signalName,
      ...copyOptsWithDealUrl(ctx, dealUrl),
    });

    await upsertPost(db, {
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
    });
    copies.push(...bundle.allCopies);
    count++;
  }

  return { count, copies };
}

async function upsertDealPost(
  db: Db,
  opts: {
    item: SignalItem;
    deal: DealMetrics;
    source: "auto" | "manual";
    signalName: string;
    ctx: VoiceGenerationContext;
    forceRegenerate?: boolean;
  },
): Promise<{ outcome: "created" | "updated" | "skipped"; socialCopies?: string[] }> {
  const { item, deal, source, signalName, ctx, forceRegenerate } = opts;
  const dealKey = buildDealKey(deal);
  const existing = await findPostByItemDeal(db, item.id, dealKey);

  let bundle: PostCopyBundle | null = null;
  if (!postHasCopy(existing) || forceRegenerate) {
    bundle = await generatePostCopies(ctx, {
      title: item.title,
      summary: item.ai_summary,
      senderFrom: item.sender_from,
      deal,
      signalName,
      ...copyOptsWithDealUrl(ctx, item.original_url),
    });
  }

  const social_copy =
    bundle?.social_copy ?? existing?.social_copy ?? primarySocialCopy(existing?.social_copy_by_platform ?? {});
  const social_copy_by_platform =
    bundle?.social_copy_by_platform ?? existing?.social_copy_by_platform ?? {};

  const { created } = await upsertPost(db, {
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
  });

  const regenerated = !postHasCopy(existing) || forceRegenerate;
  return {
    outcome: created ? "created" : "updated",
    socialCopies: regenerated ? bundle?.allCopies : undefined,
  };
}

async function upsertContentOnlyPost(
  db: Db,
  opts: {
    item: SignalItem;
    signalName: string;
    ctx: VoiceGenerationContext;
    forceRegenerate?: boolean;
  },
): Promise<{ outcome: "created" | "updated" | "skipped"; socialCopies?: string[] }> {
  const { item, signalName, ctx, forceRegenerate } = opts;
  const existing = await findPostByItemDeal(db, item.id, CONTENT_ONLY_DEAL_KEY);

  let bundle: PostCopyBundle | null = null;
  if (!postHasCopy(existing) || forceRegenerate) {
    bundle = await generatePostCopies(ctx, {
      title: item.title,
      summary: item.ai_summary,
      senderFrom: item.sender_from,
      signalName,
      ...copyOptsWithDealUrl(ctx, item.original_url),
    });
  }

  const social_copy =
    bundle?.social_copy ?? existing?.social_copy ?? primarySocialCopy(existing?.social_copy_by_platform ?? {});
  const social_copy_by_platform =
    bundle?.social_copy_by_platform ?? existing?.social_copy_by_platform ?? {};

  const { created } = await upsertPost(db, {
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
  });

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
  const items = await listSignalItems(db, {
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

  for (const item of items) {
    const deals = dealsForPostEval(item);
    if (!deals.length) {
      result.skipped++;
      continue;
    }

    for (const deal of deals) {
      if (dealStrengthPct(deal) < minPct) continue;

      const dealKey = buildDealKey(deal);
      keepKeys.add(`${item.id}:${dealKey}`);

      const { outcome, socialCopies } = await upsertDealPost(db, {
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

  result.archived = await archiveAutoPostsForSignal(db, contentSignalId, keepKeys);

  if (forceRegenerate) {
    const regen = await regenerateAllDraftPostsForContentSignal(db, contentSignalId, ctx, signal.name);
    result.regenerated = regen.count;
    newCopies.push(...regen.copies);
  }

  if (ctx.voiceId && newCopies.length) {
    await updateBrandMemoryFromCopies(db, ctx.voiceId, newCopies);
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

  const signal = await getContentSignal(db, item.content_signal_id);
  const signalName = signal?.name ?? "Content signal";
  const voice = await findVoiceForContentSignal(db, item.content_signal_id);
  const ctx = resolveVoiceGenerationContext(voice);
  const deals = dealsForPostEval(item);

  if (!deals.length) {
    const result: PostsSyncResult = { created: 0, updated: 0, archived: 0, skipped: 0 };
    const { outcome, socialCopies } = await upsertContentOnlyPost(db, {
      item,
      signalName,
      ctx,
      forceRegenerate: true,
    });
    const newCopies: string[] = socialCopies ?? [];
    if (outcome === "created") result.created++;
    else if (outcome === "updated") result.updated++;
    else result.skipped++;

    const post = await findPostByItemDeal(db, item.id, CONTENT_ONLY_DEAL_KEY);
    const posts = post ? [post] : [];

    if (ctx.voiceId && newCopies.length) {
      await updateBrandMemoryFromCopies(db, ctx.voiceId, newCopies);
    }

    return { ...result, posts };
  }

  const targets =
    dealIndex != null && dealIndex >= 0 && dealIndex < deals.length ? [deals[dealIndex]!] : deals;

  const result: PostsSyncResult = { created: 0, updated: 0, archived: 0, skipped: 0 };
  const posts: Post[] = [];
  const newCopies: string[] = [];

  for (const deal of targets) {
    const { outcome, socialCopies } = await upsertDealPost(db, {
      item,
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
    const post = await findPostByItemDeal(db, item.id, dealKey);
    if (post) posts.push(post);
  }

  if (ctx.voiceId && newCopies.length) {
    await updateBrandMemoryFromCopies(db, ctx.voiceId, newCopies);
  }

  return { ...result, posts };
}
