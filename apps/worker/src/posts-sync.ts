import type { Db } from "mongodb";
import {
  archiveAutoPostsForSignal,
  buildDealKey,
  dealStrengthPct,
  dealsForPostEval,
  findPostByItemDeal,
  findVoiceForContentSignal,
  getContentSignal,
  getSignalItem,
  listSignalItems,
  upsertPost,
  type DealMetrics,
  type Post,
  type SignalItem,
} from "@content-resourcer/db";
import { generateSocialPostCopy } from "./generate-social-post.js";

export type PostsSyncResult = {
  created: number;
  updated: number;
  archived: number;
  skipped: number;
};

async function upsertDealPost(
  db: Db,
  opts: {
    item: SignalItem;
    deal: DealMetrics;
    source: "auto" | "manual";
    signalName: string;
    persona?: string;
    forceRegenerate?: boolean;
  },
): Promise<"created" | "updated" | "skipped"> {
  const { item, deal, source, signalName, persona, forceRegenerate } = opts;
  const dealKey = buildDealKey(deal);
  const existing = await findPostByItemDeal(db, item.id, dealKey);

  let socialCopy = existing?.social_copy ?? "";
  if (!socialCopy || forceRegenerate) {
    socialCopy = await generateSocialPostCopy({
      title: item.title,
      summary: item.ai_summary,
      senderFrom: item.sender_from,
      deal,
      signalName,
      persona,
    });
  }

  const { created } = await upsertPost(db, {
    organization_id: item.organization_id,
    content_signal_id: item.content_signal_id,
    signal_item_id: item.id,
    deal_key: dealKey,
    source,
    title: item.title,
    social_copy: socialCopy,
    deal_metrics: deal,
    source_name: item.source_name,
    sender_from: item.sender_from,
    email_sent_at: item.email_sent_at,
    ai_summary: item.ai_summary,
  });

  return created ? "created" : "updated";
}

export async function syncPostsForContentSignal(
  db: Db,
  contentSignalId: string,
): Promise<PostsSyncResult> {
  const signal = await getContentSignal(db, contentSignalId);
  if (!signal) {
    return { created: 0, updated: 0, archived: 0, skipped: 0 };
  }

  const minPct = (signal.post_min_deal_pct ?? 50) / 100;
  const voice = await findVoiceForContentSignal(db, contentSignalId);
  const persona =
    voice?.persona_status === "ready" && voice.persona.trim() ? voice.persona : undefined;
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

      const outcome = await upsertDealPost(db, {
        item,
        deal,
        source: "auto",
        signalName: signal.name,
        persona,
      });
      if (outcome === "created") result.created++;
      else if (outcome === "updated") result.updated++;
      else result.skipped++;
    }
  }

  result.archived = await archiveAutoPostsForSignal(db, contentSignalId, keepKeys);
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
  const persona =
    voice?.persona_status === "ready" && voice.persona.trim() ? voice.persona : undefined;
  const deals = dealsForPostEval(item);

  if (!deals.length) {
    return { created: 0, updated: 0, archived: 0, skipped: 1, posts: [] };
  }

  const targets =
    dealIndex != null && dealIndex >= 0 && dealIndex < deals.length
      ? [deals[dealIndex]!]
      : deals;

  const result: PostsSyncResult = { created: 0, updated: 0, archived: 0, skipped: 0 };
  const posts: Post[] = [];

  for (const deal of targets) {
    const outcome = await upsertDealPost(db, {
      item,
      deal,
      source: "manual",
      signalName,
      persona,
      forceRegenerate: true,
    });
    if (outcome === "created") result.created++;
    else if (outcome === "updated") result.updated++;
    else result.skipped++;

    const dealKey = buildDealKey(deal);
    const post = await findPostByItemDeal(db, item.id, dealKey);
    if (post) posts.push(post);
  }

  return { ...result, posts };
}
