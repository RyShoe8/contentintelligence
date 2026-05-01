import { z } from "zod";

export const SOURCE_TYPE_EMAIL_GMAIL = "email_gmail" as const;

export const gmailInputConfigSchema = z.object({
  email_address: z.string().email(),
  labels: z.array(z.string()).optional(),
  sender_addresses: z.array(z.string()).optional(),
  sender_domains: z.array(z.string()).optional(),
  subject_keywords: z.array(z.string()).optional(),
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
