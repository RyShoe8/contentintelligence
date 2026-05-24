import { z } from "zod";

export const SOURCE_TYPE_EMAIL_GMAIL = "email_gmail" as const;

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

export const voiceSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().min(1),
  website_url: optionalHttpsUrl().default(""),
  rss_feed_url: optionalHttpsUrl().default(""),
  social_links: z.array(voiceSocialLinkSchema).max(10).default([]),
  keywords: z.preprocess(normalizeVoiceKeywords, z.array(z.string()).max(5).default([])),
  content_signal_ids: z.array(z.string().uuid()).default([]),
  persona: z.string().default(""),
  persona_status: voicePersonaStatusSchema.default("pending"),
  persona_error: z.string().optional(),
  persona_generated_at: z.coerce.date().optional(),
  created_by: z.string().email(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Voice = z.infer<typeof voiceSchema>;

export const sourceSchema = z.object({
  id: z.string().uuid(),
  content_signal_id: z.string().uuid(),
  source_type: z.literal(SOURCE_TYPE_EMAIL_GMAIL),
  enabled: z.boolean().default(true),
  config: gmailSourceConfigSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

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
  source_type: z.literal(SOURCE_TYPE_EMAIL_GMAIL),
  source_name: z.string(),
  sender_from: z.string(),
  title: z.string(),
  raw_content: z.string(),
  extracted_text: z.string(),
  detected_keywords: z.array(z.string()).default([]),
  relevance_score: z.number(),
  original_url: z.string().nullable().optional(),
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

export const postSourceSchema = z.enum(["auto", "manual"]);
export type PostSource = z.infer<typeof postSourceSchema>;

export const postStatusSchema = z.enum(["draft", "archived"]);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const postSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  content_signal_id: z.string().uuid(),
  signal_item_id: z.string().uuid(),
  deal_key: z.string().min(1),
  source: postSourceSchema,
  status: postStatusSchema.default("draft"),
  title: z.string(),
  social_copy: z.string(),
  deal_metrics: dealMetricsSchema,
  source_name: z.string(),
  sender_from: z.string().default(""),
  email_sent_at: z.coerce.date().optional(),
  ai_summary: z.string().nullable().optional(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Post = z.infer<typeof postSchema>;

export const gmailOAuthSchema = z.object({
  _id: z.string().optional(),
  email_address: z.string().email(),
  refresh_token: z.string(),
  access_token: z.string().optional(),
  access_token_expiry: z.coerce.date().optional(),
  last_ingest_error: z.string().optional(),
  last_ingest_error_at: z.coerce.date().optional(),
  updated_at: z.coerce.date(),
});

export type GmailOAuthDoc = z.infer<typeof gmailOAuthSchema>;

/** Human-readable label for feed rows (no user-defined source name). */
export function sourceDisplayLabel(config: GmailSourceConfig): string {
  const labels = config.labels?.filter(Boolean) ?? [];
  if (labels.length) return `Email · ${labels.join(", ")}`;
  if (config.email_address?.trim()) return `Email · ${config.email_address.trim()}`;
  return "Email";
}
