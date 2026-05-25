import { convert } from "html-to-text";
import { randomUUID } from "node:crypto";
import { sanitizeDealUrl } from "@content-resourcer/db";
import { pickDealLink } from "./extract-deal-link.js";
import type {
  ContentSignal,
  DealMetrics,
  EmailImage,
  GmailSourceConfig,
  KeyPoint,
  SignalItem,
  Source,
} from "@content-resourcer/db";
import { SOURCE_TYPE_EMAIL_GMAIL, sourceDisplayLabel } from "@content-resourcer/db";
import { env } from "./env.js";
import { extractCasinoName } from "@content-resourcer/db";
import type { NormalizedMessage } from "./gmail-client.js";

const EMAIL_HTML_PREVIEW_MAX = 120_000;

/** Bracketed image URLs left by html-to-text / ESP markup (marketing noise). */
function stripStandaloneBracketedImageUrls(text: string): string {
  return text.replace(
    /\s*\[https?:\/\/[^\]\s]+\.(?:png|jpe?g|gif|webp)(?:\?[^\]\s]*)?\]/gi,
    "",
  );
}

/** Remove common semantic footer blocks before text conversion or preview storage. */
function stripHtmlFooterBlocks(html: string): string {
  return html
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<section\b[^>]*\brole=["']contentinfo["'][^>]*>[\s\S]*?<\/section>/gi, "");
}

/** Truncate HTML for optional `email_html_preview` (Mongo size). */
export function trimEmailHtmlPreview(html: string): string | undefined {
  const stripped = stripHtmlFooterBlocks(html);
  const t = stripped.trim();
  if (!t) return undefined;
  return t.length > EMAIL_HTML_PREVIEW_MAX ? t.slice(0, EMAIL_HTML_PREVIEW_MAX) : t;
}

const PROMO_PHRASES = [
  "bonus",
  "free spins",
  "match",
  "reload",
  "vip",
  "wager",
  "promo",
  "% off",
  "limited time",
  "claim now",
  "exclusive offer",
];

function contentSignalKeywords(contentSignal: ContentSignal): string[] {
  return (contentSignal.keywords ?? [])
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

function quickPlainText(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export type PrefilterResult =
  | { ok: true }
  | { ok: false; reason: string };

export function prefilter(
  normalized: NormalizedMessage,
  contentSignal: ContentSignal,
  config: GmailSourceConfig,
): PrefilterResult {
  const combined = `${normalized.subject}\n${quickPlainText(normalized.raw_content)}`.toLowerCase();
  const plainLen = quickPlainText(normalized.raw_content).length;
  if (plainLen < env.minBodyChars) {
    return { ok: false, reason: `body_too_short:${plainLen}` };
  }

  if (!senderMatches(normalized.from, config)) {
    return { ok: false, reason: "sender_filter_mismatch" };
  }

  const keywords = contentSignalKeywords(contentSignal);
  if (keywords.length > 0) {
    const hit = keywords.some((k) => combined.includes(k.toLowerCase()));
    if (!hit) return { ok: false, reason: "keyword_no_match" };
  }

  return { ok: true };
}

function senderMatches(fromHeader: string, config: GmailSourceConfig): boolean {
  const addresses = config.sender_addresses ?? [];
  const domains = config.sender_domains ?? [];
  if (addresses.length === 0 && domains.length === 0) return true;

  const lower = fromHeader.toLowerCase();
  const emailMatch = lower.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : lower;

  for (const a of addresses) {
    if (a && email.includes(a.toLowerCase().replace(/[<>]/g, ""))) return true;
  }
  for (const d of domains) {
    const dom = d.replace(/^@+/, "").toLowerCase();
    if (dom && (email.endsWith(`@${dom}`) || lower.includes(`@${dom}`))) return true;
  }
  return false;
}

export function extractAndTruncate(raw: string, scanBody: boolean): string {
  const htmlMatch = raw.includes("<html") || raw.includes("<HTML") || /<[a-z][\s\S]*>/i.test(raw);
  const rawForConvert = htmlMatch || raw.includes("<") ? stripHtmlFooterBlocks(raw) : raw;
  let text = rawForConvert;
  if (htmlMatch || raw.includes("<")) {
    try {
      text = convert(rawForConvert, {
        wordwrap: false,
        selectors: [
          { selector: "a", options: { ignoreHref: true } },
          { selector: "img", format: "skip" },
        ],
      });
    } catch {
      text = quickPlainText(rawForConvert);
    }
  } else {
    text = quickPlainText(rawForConvert);
  }
  text = stripStandaloneBracketedImageUrls(text);
  text = stripTrackingNoise(text);
  if (!scanBody) {
    const lines = text.split("\n");
    text = lines.slice(0, 5).join("\n");
  }
  return text.slice(0, env.maxBodyChars);
}

/** Full email body text for deal parsing (ignores scan_body five-line cap). */
export function extractFullBodyText(raw: string): string {
  return extractAndTruncate(raw, true);
}

/** ESP / legal footer markers; cut at earliest match in the tail of the body. */
const FOOTER_PATTERNS: RegExp[] = [
  /unsubscribe/gi,
  /to unsubscribe/gi,
  /view in browser/gi,
  /view this email in your browser/gi,
  /privacy policy/gi,
  /you received this email/gi,
  /you are receiving this/gi,
  /why am i receiving/gi,
  /why you're receiving/gi,
  /manage your preferences/gi,
  /update your preferences/gi,
  /email preferences/gi,
  /all rights reserved/gi,
  /registered address/gi,
  /registered office/gi,
  /incorporated in/gi,
  /company number/gi,
  /this is an automated/gi,
  /automated message/gi,
  /please don['’]t reply/gi,
  /do not reply to this email/gi,
  /terms of service/gi,
  /terms and conditions/gi,
  /sweepstakes rules/gi,
  /void where prohibited/gi,
  /no purchase necessary/gi,
  /add our email to your address book/gi,
];

function stripTrackingNoise(text: string): string {
  let t = text;
  const len = t.length;
  if (len < 120) return t.replace(/\s+/g, " ").trim();

  const minStart = Math.max(200, Math.floor(len * 0.45));
  let cutAt = len;
  for (const p of FOOTER_PATTERNS) {
    p.lastIndex = 0;
    const idx = t.search(p);
    if (idx === -1) continue;
    if (idx >= minStart && idx < cutAt) {
      cutAt = idx;
    }
  }
  if (cutAt < len) {
    t = t.slice(0, cutAt);
  }
  return t.replace(/\s+/g, " ").trim();
}

export function detectKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const k of keywords) {
    if (k && lower.includes(k.toLowerCase())) found.push(k);
  }
  return found;
}

export function heuristicPromoScore(text: string): number {
  const lower = text.toLowerCase();
  let s = 0;
  for (const p of PROMO_PHRASES) {
    if (lower.includes(p)) s += 0.05;
  }
  return Math.min(s, 0.35);
}

export function keywordDensityScore(text: string, keywords: string[]): number {
  if (!keywords.length) return 0.2;
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  let hits = 0;
  const lower = text.toLowerCase();
  for (const k of keywords) {
    if (!k) continue;
    const re = new RegExp(k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const m = lower.match(re);
    hits += m?.length ?? 0;
  }
  return Math.min(hits / words, 1) * 0.5;
}

export function recencyScore(dateMs: number): number {
  const ageHours = (Date.now() - dateMs) / 3600_000;
  const halfLifeDays = 14;
  return Math.exp(-ageHours / (halfLifeDays * 24)) * 0.35;
}

/** Internal 0–1 strength → stored relevance 1–10 (one decimal, 10 = best). */
export function mapRelevanceInternalToScale(internal01: number): number {
  const s = Math.min(1, Math.max(0, internal01));
  return Math.round((1 + 9 * s) * 10) / 10;
}

export function computeRelevanceScore(
  text: string,
  keywords: string[],
  dateMs: number,
): number {
  const kd = keywordDensityScore(text, keywords);
  const promo = heuristicPromoScore(text);
  const rec = recencyScore(dateMs);
  const score = kd + promo + rec;
  return mapRelevanceInternalToScale(score);
}

function resolveOriginalUrl(
  normalized: NormalizedMessage,
  emailHtmlPreview?: string | null,
): string | null {
  return sanitizeDealUrl(
    pickDealLink(normalized.links, {
      html: emailHtmlPreview ?? undefined,
      subject: normalized.subject,
      from: normalized.from,
    }),
  );
}

export function buildMinimalSignalItem(
  contentSignal: ContentSignal,
  source: Source,
  normalized: NormalizedMessage,
  skipReason: string,
  emailHtmlPreview?: string | null,
): SignalItem {
  const extracted = extractAndTruncate(normalized.raw_content, source.config.scan_body).slice(0, 2000);
  const kws = contentSignalKeywords(contentSignal);
  const detected = detectKeywords(extracted, kws);
  const email_sent_at =
    Number.isFinite(normalized.dateMs) && normalized.dateMs > 0 ? new Date(normalized.dateMs) : undefined;
  const preview = emailHtmlPreview != null ? trimEmailHtmlPreview(emailHtmlPreview) : undefined;
  const original_url = resolveOriginalUrl(normalized, emailHtmlPreview);
  const casino_name =
    extractCasinoName(normalized.from, normalized.subject, original_url) ?? undefined;
  const base: SignalItem = {
    id: randomUUID(),
    organization_id: contentSignal.organization_id,
    content_signal_id: contentSignal.id,
    source_id: source.id,
    source_type: SOURCE_TYPE_EMAIL_GMAIL,
    source_name: sourceDisplayLabel(source.config),
    sender_from: normalized.from,
    ...(casino_name ? { casino_name } : {}),
    title: normalized.subject,
    raw_content: normalized.raw_content.slice(0, 50_000),
    extracted_text: extracted,
    detected_keywords: detected,
    relevance_score: 1,
    original_url,
    key_points: [],
    external_id: normalized.external_id,
    ai_summary: null,
    ai_processed: false,
    skip_reason: skipReason,
    created_at: new Date(),
    ...(email_sent_at ? { email_sent_at } : {}),
    ...(preview ? { email_html_preview: preview } : {}),
  };
  return base;
}

export function buildFullSignalItem(
  contentSignal: ContentSignal,
  source: Source,
  normalized: NormalizedMessage,
  extractedText: string,
  aiSummary: string,
  deal_metrics?: DealMetrics,
  deals_found?: DealMetrics[],
  email_images?: EmailImage[],
  emailHtmlPreview?: string | null,
  key_points: KeyPoint[] = [],
): SignalItem {
  const kws = contentSignalKeywords(contentSignal);
  const detected = detectKeywords(extractedText, kws);
  const relevance = computeRelevanceScore(extractedText, kws, normalized.dateMs);
  const trimmed = aiSummary.trim();
  const email_sent_at =
    Number.isFinite(normalized.dateMs) && normalized.dateMs > 0 ? new Date(normalized.dateMs) : undefined;
  const preview = emailHtmlPreview != null ? trimEmailHtmlPreview(emailHtmlPreview) : undefined;
  const original_url = resolveOriginalUrl(normalized, emailHtmlPreview);
  const casino_name =
    extractCasinoName(normalized.from, normalized.subject, original_url) ?? undefined;
  const base: SignalItem = {
    id: randomUUID(),
    organization_id: contentSignal.organization_id,
    content_signal_id: contentSignal.id,
    source_id: source.id,
    source_type: SOURCE_TYPE_EMAIL_GMAIL,
    source_name: sourceDisplayLabel(source.config),
    sender_from: normalized.from,
    ...(casino_name ? { casino_name } : {}),
    title: normalized.subject,
    raw_content: normalized.raw_content.slice(0, 50_000),
    extracted_text: extractedText,
    detected_keywords: detected,
    relevance_score: relevance,
    original_url,
    key_points: key_points.length ? key_points : [],
    external_id: normalized.external_id,
    ai_summary: trimmed || null,
    ai_processed: Boolean(trimmed),
    skip_reason: null,
    created_at: new Date(),
    ...(email_sent_at ? { email_sent_at } : {}),
    ...(preview ? { email_html_preview: preview } : {}),
  };
  let withDeal = deal_metrics ? { ...base, deal_metrics } : base;
  if (deals_found?.length) {
    withDeal = { ...withDeal, deals_found };
  }
  return email_images?.length ? { ...withDeal, email_images } : withDeal;
}
