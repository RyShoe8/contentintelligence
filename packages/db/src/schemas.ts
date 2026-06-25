import { z } from "zod";
import { brandProfileSchema, sanitizeBrandProfileInput } from "./brand-profile.js";
import { keyPointsFieldSchema } from "./key-points.js";
import {
  WRITER_ARTICLE_DEPTH_DEFAULT,
  WRITER_SUBTOPIC_MAX,
  WRITER_SUBTOPIC_MAX_CHARS,
  WRITER_SUBTOPIC_MIN_CHARS,
} from "./writer-validation.js";
import {
  normalizeDistributionPlatforms,
  normalizeSocialCopyByPlatform,
  primarySocialCopy,
  socialCopyByPlatformFromDoc,
  SOCIAL_PLATFORM_IDS,
  socialPlatformIdSchema,
} from "./social-platforms.js";

export const SOURCE_TYPE_EMAIL_GMAIL = "email_gmail" as const;
export const SOURCE_TYPE_WEBSITE = "website" as const;

/** Per-URL resolved discovery state stored by the worker after probing. */
export const websiteUrlMetaSchema = z.object({
  url: z.string().url(),
  rss_url: z.string().url().optional(),
  rss_discovered: z.boolean().default(false),
  last_checked_at: z.coerce.date().optional(),
  last_error: z.string().optional(),
});
export type WebsiteUrlMeta = z.infer<typeof websiteUrlMetaSchema>;

/** Config for a website-based content source. */
export const websiteSourceConfigSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(25),
  url_meta: z.array(websiteUrlMetaSchema).optional(),
  ai_summary_enabled: z.boolean().default(true),
});
export type WebsiteSourceConfig = z.infer<typeof websiteSourceConfigSchema>;

/** Mongo often stores explicit null; Zod optional arrays reject null without preprocess. */
function optionalStringArray() {
  return z.preprocess(
    (val) => (val == null ? undefined : val),
    z.array(z.string()).optional(),
  );
}

function normalizeDealUnitTokensIn(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of val) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s || s.length > 12) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Per-source Gmail inbox filters and ingest toggles. */
export const gmailSourceConfigSchema = z.object({
  email_address: z.string().default(""),
  labels: optionalStringArray(),
  sender_addresses: optionalStringArray(),
  sender_domains: optionalStringArray(),
  scan_body: z.boolean().default(true),
  ai_summary_enabled: z.boolean().default(true),
});

export type GmailSourceConfig = z.infer<typeof gmailSourceConfigSchema>;

export const orgRoleSchema = z.enum(["owner", "member"]);
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Organization = z.infer<typeof organizationSchema>;

export const orgInviteRoleSchema = z.enum(["owner", "member"]);
export type OrgInviteRole = z.infer<typeof orgInviteRoleSchema>;

export const orgInviteSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  email: z.string().email(),
  role: orgInviteRoleSchema.default("member"),
  invited_by: z.string().email(),
  created_at: z.coerce.date(),
});

export type OrgInvite = z.infer<typeof orgInviteSchema>;

export const contentSignalSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  lookback_window_hours: z.number().int().positive().max(24 * 90).default(168),
  deal_unit_tokens: z.preprocess(
    normalizeDealUnitTokensIn,
    z.array(z.string().max(12)).max(32).default([]),
  ),
  active: z.boolean().default(true),
  post_min_deal_pct: z.preprocess(
    (val) => (val == null || val === "" ? 50 : val),
    z.number().int().min(0).max(100).default(50),
  ),
  ingest_interval_minutes: z.preprocess(
    (val) => (val == null || val === "" ? null : val),
    z.number().int().positive().max(24 * 60).nullable().default(null),
  ),
  last_ingest_completed_at: z.preprocess(
    (val) => (val == null || val === "" ? undefined : val),
    z.coerce.date().optional(),
  ),
  last_ingest_attempt_at: z.preprocess(
    (val) => (val == null || val === "" ? undefined : val),
    z.coerce.date().optional(),
  ),
  last_ingest_error: z.string().trim().optional(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type ContentSignal = z.infer<typeof contentSignalSchema>;

export const contentSignalTemplateSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  lookback_window_hours: z.number().int().positive().max(24 * 90).default(168),
  deal_unit_tokens: z.preprocess(
    normalizeDealUnitTokensIn,
    z.array(z.string().max(12)).max(32).default([]),
  ),
  active: z.boolean().default(true),
  post_min_deal_pct: z.preprocess(
    (val) => (val == null || val === "" ? 50 : val),
    z.number().int().min(0).max(100).default(50),
  ),
  ingest_interval_minutes: z.preprocess(
    (val) => (val == null || val === "" ? null : val),
    z.number().int().positive().max(24 * 60).nullable().default(null),
  ),
  created_by: z.string().email(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type ContentSignalTemplate = z.infer<typeof contentSignalTemplateSchema>;

export const voiceSocialLinkSchema = z.object({
  label: z.string().optional(),
  url: z.string().url(),
});

export type VoiceSocialLink = z.infer<typeof voiceSocialLinkSchema>;

const MAX_PHRASES_PER_ROW = 8;

function splitPhraseInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_PHRASES_PER_ROW) break;
  }
  return out;
}

function normalizeVoicePreferredPhraseEntry(val: unknown): unknown {
  if (!val || typeof val !== "object") return val;
  const o = val as Record<string, unknown>;
  const phraseList: string[] = [];
  const seen = new Set<string>();

  const addPhrases = (items: string[]) => {
    for (const s of items) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      phraseList.push(s);
      if (phraseList.length >= MAX_PHRASES_PER_ROW) return;
    }
  };

  if (Array.isArray(o.phrases)) {
    for (const x of o.phrases) {
      if (typeof x === "string") addPhrases(splitPhraseInput(x));
    }
  }
  if (typeof o.phrase === "string") {
    addPhrases(splitPhraseInput(o.phrase));
  }

  const urlVal = o.url;
  const url =
    typeof urlVal === "string" && urlVal.trim().startsWith("https://") ? urlVal.trim() : undefined;
  const freqRaw = o.frequency_level;
  const frequency_level =
    freqRaw == null || freqRaw === ""
      ? 50
      : Math.max(0, Math.min(100, Math.round(Number(freqRaw) || 50)));
  const allow_ai_variations =
    o.allow_ai_variations === true ||
    o.allow_ai_variations === 1 ||
    o.allow_ai_variations === "1" ||
    o.allow_ai_variations === "true";

  return {
    phrases: phraseList.length ? phraseList : [""],
    url,
    frequency_level,
    allow_ai_variations,
  };
}

export const voicePreferredPhraseSchema = z.preprocess(
  normalizeVoicePreferredPhraseEntry,
  z.object({
    phrases: z.array(z.string().min(1)).min(1).max(MAX_PHRASES_PER_ROW),
    url: z.preprocess(
      (v) => (v == null || v === "" ? undefined : String(v).trim()),
      z
        .string()
        .url()
        .refine((s) => s.startsWith("https://"), { message: "URL must use https" })
        .optional(),
    ),
    frequency_level: z.preprocess(
      (v) => (v == null || v === "" ? 50 : v),
      z.coerce.number().int().min(0).max(100).default(50),
    ),
    allow_ai_variations: z.preprocess(
      (v) => v === true || v === 1 || v === "1" || v === "true",
      z.boolean().default(false),
    ),
  }),
);

export type VoicePreferredPhrase = z.infer<typeof voicePreferredPhraseSchema>;

export const voicePersonaStatusSchema = z.enum(["pending", "ready", "failed"]);
export type VoicePersonaStatus = z.infer<typeof voicePersonaStatusSchema>;

function normalizeVoiceKeywords(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of val) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 5) break;
  }
  return out;
}

function normalizePreferredPhrasesFromLegacy(
  phrasesRaw: unknown,
  linksRaw: unknown,
): VoicePreferredPhrase[] {
  const legacyLinks = Array.isArray(linksRaw) ? linksRaw : [];
  const linkUrls: (string | undefined)[] = legacyLinks.map((l) => {
    if (!l || typeof l !== "object") return undefined;
    const url = (l as { url?: unknown }).url;
    if (typeof url !== "string" || !url.startsWith("https://")) return undefined;
    return url;
  });

  const seenRows = new Set<string>();
  const out: VoicePreferredPhrase[] = [];

  const pushRow = (
    phraseInput: string,
    url?: string,
    frequencyLevel = 50,
    allowAiVariations = false,
  ) => {
    const phrases = splitPhraseInput(phraseInput);
    if (!phrases.length) return;
    const rowKey = phrases[0]!.toLowerCase();
    if (seenRows.has(rowKey)) return;
    seenRows.add(rowKey);
    const level = Math.max(0, Math.min(100, Math.round(frequencyLevel)));
    const entry: VoicePreferredPhrase = {
      phrases,
      frequency_level: level,
      allow_ai_variations: allowAiVariations,
    };
    if (url?.startsWith("https://")) entry.url = url;
    out.push(entry);
  };

  if (Array.isArray(phrasesRaw)) {
    for (let i = 0; i < phrasesRaw.length && out.length < 15; i++) {
      const x = phrasesRaw[i];
      if (typeof x === "string") {
        pushRow(x, linkUrls[i]);
        continue;
      }
      if (x && typeof x === "object") {
        const o = x as {
          phrase?: unknown;
          phrases?: unknown;
          url?: unknown;
          frequency_level?: unknown;
          allow_ai_variations?: unknown;
        };
        let phraseInput = "";
        if (Array.isArray(o.phrases)) {
          phraseInput = o.phrases
            .filter((p): p is string => typeof p === "string")
            .join(", ");
        } else if (typeof o.phrase === "string") {
          phraseInput = o.phrase;
        }
        const urlVal = o.url;
        const url =
          typeof urlVal === "string" && urlVal.startsWith("https://") ? urlVal : linkUrls[i];
        const freqRaw = o.frequency_level;
        const frequencyLevel =
          freqRaw == null || freqRaw === ""
            ? 50
            : Math.max(0, Math.min(100, Math.round(Number(freqRaw) || 50)));
        const allowAi =
          o.allow_ai_variations === true ||
          o.allow_ai_variations === 1 ||
          o.allow_ai_variations === "1";
        pushRow(phraseInput, url, frequencyLevel, allowAi);
      }
    }
  }

  return out
    .map((row) => voicePreferredPhraseSchema.parse(row))
    .filter((row) => row.phrases.length > 0 && row.phrases[0] !== "");
}

function preprocessVoiceDocument(val: unknown): unknown {
  if (!val || typeof val !== "object") return val;
  const doc = { ...(val as Record<string, unknown>) };
  doc.preferred_phrases = normalizePreferredPhrasesFromLegacy(
    doc.preferred_phrases,
    doc.preferred_links,
  );
  delete doc.preferred_links;
  return doc;
}

function optionalHttpsUrl() {
  return z.preprocess(
    (v) => (v == null ? "" : String(v).trim()),
    z
      .string()
      .refine((s) => s === "" || z.string().url().safeParse(s).success, {
        message: "Invalid URL",
      })
      .refine((s) => s === "" || s.startsWith("https://"), {
        message: "URL must use https",
      }),
  );
}

export const voiceSchema = z.preprocess(
  preprocessVoiceDocument,
  z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().min(1),
  brand_mention_level: z.preprocess(
    (v) => (v == null || v === "" ? 50 : v),
    z.coerce.number().int().min(0).max(100).default(50),
  ),
  sources_in_posts_level: z.preprocess(
    (v) => (v == null || v === "" ? 0 : v),
    z.coerce.number().int().min(0).max(100).default(0),
  ),
  website_url: optionalHttpsUrl().default(""),
  rss_feed_url: optionalHttpsUrl().default(""),
  social_links: z.array(voiceSocialLinkSchema).max(10).default([]),
  keywords: z.preprocess(normalizeVoiceKeywords, z.array(z.string()).max(5).default([])),
  preferred_phrases: z.array(voicePreferredPhraseSchema).max(15).default([]),
  content_signal_ids: z.array(z.string().uuid()).default([]),
  excluded_style_source_urls: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []),
    z.array(z.string().url()).max(200).default([]),
  ),
  distribution_platforms: z.preprocess(
    (v) => normalizeDistributionPlatforms(v),
    z.array(socialPlatformIdSchema).max(SOCIAL_PLATFORM_IDS.length).default([]),
  ),
  persona: z.string().default(""),
  persona_status: voicePersonaStatusSchema.default("pending"),
  persona_error: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().optional(),
  ),
  persona_generated_at: z.coerce.date().optional(),
  /** Set when a generate/retry was last kicked off (stale-pending detection). */
  persona_requested_at: z.coerce.date().optional(),
  brand_profile: z.preprocess(
    (v) => (v == null ? undefined : sanitizeBrandProfileInput(v)),
    brandProfileSchema.optional(),
  ),
  corpus_hash: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().optional(),
  ),
  brand_profile_version: z.preprocess(
    (v) => (v == null || v === "" ? 0 : v),
    z.number().int().min(0).default(0),
  ),
  style_examples_synced_at: z.coerce.date().optional(),
  style_examples_sync_summary: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().max(500).optional(),
  ),
  style_examples_sync_error: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().max(500).optional(),
  ),
  created_by: z.string().email(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  }),
);

export type Voice = z.infer<typeof voiceSchema>;

export const gmailSourceSchema = z.object({
  id: z.string().uuid(),
  content_signal_id: z.string().uuid(),
  source_type: z.literal(SOURCE_TYPE_EMAIL_GMAIL),
  enabled: z.boolean().default(true),
  config: gmailSourceConfigSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const websiteSourceSchema = z.object({
  id: z.string().uuid(),
  content_signal_id: z.string().uuid(),
  source_type: z.literal(SOURCE_TYPE_WEBSITE),
  enabled: z.boolean().default(true),
  config: websiteSourceConfigSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const sourceSchema = z.discriminatedUnion("source_type", [
  gmailSourceSchema,
  websiteSourceSchema,
]);

export type GmailSource = z.infer<typeof gmailSourceSchema>;
export type WebsiteSource = z.infer<typeof websiteSourceSchema>;
export type Source = z.infer<typeof sourceSchema>;

export const dealMetricsModeSchema = z.enum([
  "retail_list_vs_sale",
  "pay_vs_credited_value",
  "unknown",
]);

export type DealMetricsMode = z.infer<typeof dealMetricsModeSchema>;

export const dealMetricsSourceSchema = z.enum(["regex", "llm", "merged", "none"]);

export type DealMetricsSource = z.infer<typeof dealMetricsSourceSchema>;

export const dealMetricsSchema = z.object({
  mode: dealMetricsModeSchema,
  you_pay: z.number().optional(),
  baseline_value: z.number().optional(),
  pay_unit: z.string().optional(),
  credit_unit: z.string().optional(),
  units_comparable: z.preprocess(
    (v) => (v === undefined || v === null ? true : v),
    z.boolean(),
  ),
  effective_savings_pct: z.number(),
  bonus_pct: z.number().optional(),
  value_ratio: z.number().optional(),
  confidence: z.number().min(0).max(1),
  source: dealMetricsSourceSchema,
});

export type DealMetrics = z.infer<typeof dealMetricsSchema>;

export const emailImageSchema = z.object({
  mime: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  data_base64: z.string(),
  filename: z.preprocess(
    (v) => (v === null || v === "" ? undefined : v),
    z.string().optional(),
  ),
});

export type EmailImage = z.infer<typeof emailImageSchema>;

function optionalEmailImages() {
  return z.preprocess(
    (val) => (val == null ? undefined : val),
    z.array(emailImageSchema).max(25).optional(),
  );
}

function optionalDealMetrics() {
  return z.preprocess(
    (val) => (val == null ? undefined : val),
    dealMetricsSchema.optional(),
  );
}

function optionalDealsFound() {
  return z.preprocess(
    (val) => (val == null ? undefined : val),
    z.array(dealMetricsSchema).max(20).optional(),
  );
}

/** Legacy 0–1 relevance → stored 1–10 scale; map old vertical/input_signal ids on read. */
function normalizeSignalItemMongoDoc(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };
  if (o.sender_from == null) o.sender_from = "";
  if (o.content_signal_id == null && o.vertical_id != null) {
    o.content_signal_id = o.vertical_id;
  }
  if (o.source_id == null && o.input_signal_id != null) {
    o.source_id = o.input_signal_id;
  }
  const rs = o.relevance_score;
  const sr = o.skip_reason;
  if (typeof rs === "number" && Number.isFinite(rs) && rs <= 1) {
    const hasSkip = sr != null && String(sr).length > 0;
    if (!(rs === 1 && hasSkip)) {
      const s = Math.min(1, Math.max(0, rs));
      o.relevance_score = Math.round((1 + 9 * s) * 10) / 10;
    }
  }
  return o;
}

const signalItemShape = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  content_signal_id: z.string().uuid(),
  source_id: z.string().uuid(),
  source_type: z.union([z.literal(SOURCE_TYPE_EMAIL_GMAIL), z.literal(SOURCE_TYPE_WEBSITE)]),
  source_name: z.string(),
  sender_from: z.string(),
  casino_name: z.preprocess(
    (v) => {
      if (typeof v !== "string") return undefined;
      const s = v.trim().slice(0, 120);
      return s || undefined;
    },
    z.string().max(120).optional(),
  ),
  title: z.string(),
  raw_content: z.string(),
  extracted_text: z.string(),
  detected_keywords: z.array(z.string()).default([]),
  relevance_score: z.number(),
  original_url: z.string().nullable().optional(),
  key_points: keyPointsFieldSchema,
  external_id: z.string(),
  ai_summary: z.string().nullable().optional(),
  ai_processed: z.boolean().default(false),
  skip_reason: z.string().nullable().optional(),
  deal_metrics: optionalDealMetrics(),
  deals_found: optionalDealsFound(),
  email_images: optionalEmailImages(),
  email_sent_at: z.coerce.date().optional(),
  email_html_preview: z.preprocess(
    (v) => (v === null || v === "" ? undefined : v),
    z.string().max(150_000).optional(),
  ),
  created_at: z.coerce.date(),
});

export const signalItemSchema = z.preprocess(normalizeSignalItemMongoDoc, signalItemShape);

export type SignalItem = z.infer<typeof signalItemShape>;

/** Feed list attachment metadata without base64 payload. */
export const emailImageMetaSchema = z.object({
  mime: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  filename: z.preprocess(
    (v) => (v === null || v === "" ? undefined : v),
    z.string().optional(),
  ),
});

export type EmailImageMeta = z.infer<typeof emailImageMetaSchema>;

const signalItemFeedRowShape = signalItemShape
  .omit({ raw_content: true, email_html_preview: true })
  .extend({
    email_images: z.preprocess(
      (val) => (val == null ? undefined : val),
      z.array(emailImageMetaSchema).max(25).optional(),
    ),
  });

export const signalItemFeedRowSchema = z.preprocess(
  normalizeSignalItemMongoDoc,
  signalItemFeedRowShape,
);

export type SignalItemFeedRow = z.infer<typeof signalItemFeedRowShape>;

/** Posts display row: full email_images with base64, without raw email body fields. */
const signalItemPostDisplayRowShape = signalItemShape.omit({
  raw_content: true,
  email_html_preview: true,
});

export const signalItemPostDisplayRowSchema = z.preprocess(
  normalizeSignalItemMongoDoc,
  signalItemPostDisplayRowShape,
);

export type SignalItemPostDisplayRow = z.infer<typeof signalItemPostDisplayRowShape>;

export const postSourceSchema = z.enum(["auto", "manual"]);
export type PostSource = z.infer<typeof postSourceSchema>;

export const postStatusSchema = z.enum(["draft", "archived"]);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const postImageStatusSchema = z.enum(["idle", "pending", "ready", "failed"]);
export type PostImageStatus = z.infer<typeof postImageStatusSchema>;

export const generatedPostImageSchema = z.object({
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data_base64: z.string(),
});

export type GeneratedPostImage = z.infer<typeof generatedPostImageSchema>;

function preprocessPostDocument(val: unknown): unknown {
  if (!val || typeof val !== "object") return val;
  const doc = { ...(val as Record<string, unknown>) };
  const legacy = typeof doc.social_copy === "string" ? doc.social_copy : "";
  let byPlatform = normalizeSocialCopyByPlatform(doc.social_copy_by_platform);
  byPlatform = socialCopyByPlatformFromDoc(byPlatform, legacy);
  doc.social_copy_by_platform = byPlatform;
  doc.social_copy = primarySocialCopy(byPlatform, legacy);
  return doc;
}

const postShape = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  content_signal_id: z.string().uuid(),
  signal_item_id: z.string().uuid(),
  deal_key: z.string().min(1),
  source: postSourceSchema,
  status: postStatusSchema.default("draft"),
  title: z.string(),
  social_copy: z.string(),
  social_copy_by_platform: z
    .record(socialPlatformIdSchema, z.string())
    .default({} as Record<z.infer<typeof socialPlatformIdSchema>, string>),
  deal_metrics: dealMetricsSchema,
  source_name: z.string(),
  sender_from: z.string().default(""),
  email_sent_at: z.coerce.date().optional(),
  ai_summary: z.string().nullable().optional(),
  generated_image: z.preprocess(
    (v) => (v == null ? undefined : v),
    generatedPostImageSchema.optional(),
  ),
  image_prompt: z.preprocess(
    (v) => (v === null || v === "" ? undefined : v),
    z.string().max(4000).optional(),
  ),
  image_status: postImageStatusSchema.default("idle"),
  image_error: z.preprocess(
    (v) => (v === null || v === "" ? undefined : v),
    z.string().max(500).optional(),
  ),
  image_generated_at: z.coerce.date().optional(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const postSchema = z.preprocess(preprocessPostDocument, postShape);

export type Post = z.infer<typeof postShape>;

export const gmailOAuthSchema = z.object({
  _id: z.string().optional(),
  email_address: z.string().email(),
  refresh_token: z.string(),
  access_token: z.string().optional(),
  access_token_expiry: z.coerce.date().optional(),
  /** When the current refresh token was issued (re-connect resets Testing-mode ~7-day TTL). */
  refresh_token_issued_at: z.coerce.date().optional(),
  last_ingest_error: z.string().optional(),
  last_ingest_error_at: z.coerce.date().optional(),
  updated_at: z.coerce.date(),
});

export type GmailOAuthDoc = z.infer<typeof gmailOAuthSchema>;

export const writerArticleStatusSchema = z.enum(["draft", "saved"]);
export type WriterArticleStatus = z.infer<typeof writerArticleStatusSchema>;

export const writerArticleLinkSchema = z.object({
  url: z.string().url(),
  label: z.string().max(80).optional(),
});

export const writerArticleModeSchema = z.enum(["compose", "rewrite", "style_example"]);
export type WriterArticleMode = z.infer<typeof writerArticleModeSchema>;

export const writerComposeJobStatusSchema = z.enum(["pending", "ready", "failed"]);
export type WriterComposeJobStatus = z.infer<typeof writerComposeJobStatusSchema>;

export const writerComposePhaseSchema = z.enum(["full", "write_only"]);
export type WriterComposePhase = z.infer<typeof writerComposePhaseSchema>;

export const writerComposeMetaSchema = z.object({
  references_fetched: z.number().int().optional(),
  references_failed: z.array(z.string()).default([]).optional(),
  user_references_fetched: z.number().int().optional(),
  web_references_fetched: z.number().int().optional(),
  web_search_urls: z.array(z.string()).default([]).optional(),
  research_questions: z.number().int().optional(),
  research_mode: z.enum(["deep", "standard"]).optional(),
  source_truncated: z.boolean().optional(),
  links_requested: z.number().int().optional(),
  links_present: z.number().int().optional(),
  links_carried_from_source: z.number().int().optional(),
  links_added: z.number().int().optional(),
  links_non_requested_in_output: z.number().int().optional(),
  links_appended: z.number().int().optional(),
  links_woven: z.number().int().optional(),
  links_redistributed: z.number().int().optional(),
  links_revised: z.boolean().optional(),
  facts_extracted: z.boolean().optional(),
  human_authenticity_score: z.number().optional(),
  brand_consistency_score: z.number().optional(),
  genericity_score: z.number().optional(),
  humanization_attempts: z.number().int().optional(),
  voice_quality_warning: z.string().max(2000).optional(),
});

export type WriterComposeMeta = z.infer<typeof writerComposeMetaSchema>;

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

export const composeArticleArchetypeSchema = z.object({
  sectionCount: z.number().int().min(1).max(12),
  sampleHeadings: z.array(z.string().trim().min(1)).max(20).default([]),
  openingPattern: optionalTrimmedString(500),
  singleThreaded: z.boolean().default(true),
});

export type ComposeArticleArchetype = z.infer<typeof composeArticleArchetypeSchema>;

export const composeStyleKitRhythmSchema = z.object({
  shortParagraphShare: z.number().min(0).max(1).default(0),
  hasFragments: z.boolean().default(false),
  hasBoldLines: z.boolean().default(false),
});

export type ComposeStyleKitRhythm = z.infer<typeof composeStyleKitRhythmSchema>;

export const composeStyleKitSchema = z.object({
  headings: z.array(z.string().trim().min(1)).max(30).default([]),
  openingParagraphs: z.array(z.string().trim().min(1)).max(6).default([]),
  signatureParagraphs: z.array(z.string().trim().min(1)).max(8).default([]),
  concreteDetails: z.array(z.string().trim().min(1)).max(15).default([]),
  rhythmSample: optionalTrimmedString(800),
  rhythm: composeStyleKitRhythmSchema.optional(),
  archetype: composeArticleArchetypeSchema.optional(),
});

export type ComposeStyleKit = z.infer<typeof composeStyleKitSchema>;

/** Strip null/empty optional nested fields before Zod parse (Mongo legacy shape). */
export function sanitizeComposeStyleKitInput(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) return v;
  const kit = { ...(v as Record<string, unknown>) };
  if (kit.rhythmSample == null || kit.rhythmSample === "") delete kit.rhythmSample;
  if (kit.rhythm == null) delete kit.rhythm;
  if (kit.concreteDetails == null) delete kit.concreteDetails;
  if (kit.archetype && typeof kit.archetype === "object" && !Array.isArray(kit.archetype)) {
    const arch = { ...(kit.archetype as Record<string, unknown>) };
    if (arch.openingPattern == null || arch.openingPattern === "") delete arch.openingPattern;
    kit.archetype = arch;
  }
  return kit;
}

/** Normalize kit before Mongo write — never persist null optional strings. */
export function sanitizeComposeStyleKitForStorage(kit: ComposeStyleKit): ComposeStyleKit {
  return composeStyleKitSchema.parse(sanitizeComposeStyleKitInput(kit));
}

export const writerArticleSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  voice_id: z.string().uuid(),
  mode: writerArticleModeSchema.default("rewrite"),
  title: z.string().min(1).max(200),
  topic: z.string().trim().max(500).optional(),
  reference_urls: z.array(z.string().url()).max(15).default([]),
  subtopics: z
    .array(z.string().trim().min(WRITER_SUBTOPIC_MIN_CHARS).max(WRITER_SUBTOPIC_MAX_CHARS))
    .max(WRITER_SUBTOPIC_MAX)
    .default([]),
  article_depth: z.coerce.number().int().min(0).max(100).default(WRITER_ARTICLE_DEPTH_DEFAULT),
  article_type: z
    .enum(["editorial", "how_to"])
    .optional(),
  source_text: z.string(),
  links: z.array(writerArticleLinkSchema).max(5).default([]),
  generated_html: z.string().default(""),
  final_html: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().optional(),
  ),
  status: writerArticleStatusSchema.default("draft"),
  compose_status: writerComposeJobStatusSchema.optional(),
  compose_error: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().max(2000).optional(),
  ),
  compose_requested_at: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.coerce.date().optional(),
  ),
  compose_phase: writerComposePhaseSchema.optional(),
  compose_meta: z.preprocess(
    (v) => (v == null ? undefined : v),
    writerComposeMetaSchema.optional(),
  ),
  compose_style_kit: z.preprocess(
    sanitizeComposeStyleKitInput,
    composeStyleKitSchema.optional(),
  ),
  created_by: z.string().email(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type WriterArticle = z.infer<typeof writerArticleSchema>;

/** Human-readable label for feed rows (no user-defined source name). */
export function sourceDisplayLabel(config: GmailSourceConfig): string {
  const labels = config.labels?.filter(Boolean) ?? [];
  if (labels.length) return `Email · ${labels.join(", ")}`;
  if (config.email_address?.trim()) return `Email · ${config.email_address.trim()}`;
  return "Email";
}
