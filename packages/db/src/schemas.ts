import { z } from "zod";

export const SOURCE_TYPE_EMAIL_GMAIL = "email_gmail" as const;

/** Mongo often stores explicit null; Zod optional arrays reject null without preprocess. */
function optionalStringArray() {
  return z.preprocess(
    (val) => (val == null ? undefined : val),
    z.array(z.string()).optional(),
  );
}

export const gmailInputConfigSchema = z.object({
  email_address: z.string().email(),
  labels: optionalStringArray(),
  sender_addresses: optionalStringArray(),
  sender_domains: optionalStringArray(),
  subject_keywords: optionalStringArray(),
  scan_body: z.boolean().default(true),
  lookback_window_hours: z.number().int().positive().max(24 * 90).default(168),
});

export type GmailInputConfig = z.infer<typeof gmailInputConfigSchema>;

export const verticalSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(""),
  default_keywords: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Vertical = z.infer<typeof verticalSchema>;

export const inputSignalSchema = z.object({
  id: z.string().uuid(),
  vertical_id: z.string().uuid(),
  source_type: z.literal(SOURCE_TYPE_EMAIL_GMAIL),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  keywords: z.array(z.string()).default([]),
  config: gmailInputConfigSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type InputSignal = z.infer<typeof inputSignalSchema>;

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
  /** Portion saved vs baseline: 1 - you_pay / baseline_value (0–1). */
  effective_savings_pct: z.number(),
  /** baseline_value / you_pay when both defined. */
  value_ratio: z.number().optional(),
  confidence: z.number().min(0).max(1),
  source: dealMetricsSourceSchema,
});

export type DealMetrics = z.infer<typeof dealMetricsSchema>;

function optionalDealMetrics() {
  return z.preprocess(
    (val) => (val == null ? undefined : val),
    dealMetricsSchema.optional(),
  );
}

export const signalItemSchema = z.object({
  id: z.string().uuid(),
  vertical_id: z.string().uuid(),
  input_signal_id: z.string().uuid(),
  source_type: z.literal(SOURCE_TYPE_EMAIL_GMAIL),
  source_name: z.string(),
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
  created_at: z.coerce.date(),
});

export type SignalItem = z.infer<typeof signalItemSchema>;

export const gmailOAuthSchema = z.object({
  _id: z.string().optional(),
  email_address: z.string().email(),
  refresh_token: z.string(),
  access_token: z.string().optional(),
  access_token_expiry: z.coerce.date().optional(),
  updated_at: z.coerce.date(),
});

export type GmailOAuthDoc = z.infer<typeof gmailOAuthSchema>;
