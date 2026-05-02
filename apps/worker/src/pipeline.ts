import { convert } from "html-to-text";
import { randomUUID } from "node:crypto";
import type { DealMetrics, GmailInputConfig, InputSignal, SignalItem, Vertical } from "@content-resourcer/db";
import { SOURCE_TYPE_EMAIL_GMAIL } from "@content-resourcer/db";
import { env } from "./env.js";
import type { NormalizedMessage } from "./gmail-client.js";

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

function mergeKeywords(vertical: Vertical, signal: InputSignal): string[] {
  const set = new Set<string>();
  for (const k of vertical.default_keywords ?? []) {
    if (k.trim()) set.add(k.trim().toLowerCase());
  }
  for (const k of signal.keywords ?? []) {
    if (k.trim()) set.add(k.trim().toLowerCase());
  }
  return [...set];
}

function quickPlainText(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export type PrefilterResult =
  | { ok: true }
  | { ok: false; reason: string };

export function prefilter(
  normalized: NormalizedMessage,
  vertical: Vertical,
  signal: InputSignal,
  config: GmailInputConfig,
): PrefilterResult {
  const combined = `${normalized.subject}\n${quickPlainText(normalized.raw_content)}`.toLowerCase();
  const plainLen = quickPlainText(normalized.raw_content).length;
  if (plainLen < env.minBodyChars) {
    return { ok: false, reason: `body_too_short:${plainLen}` };
  }

  if (!senderMatches(normalized.from, config)) {
    return { ok: false, reason: "sender_filter_mismatch" };
  }

  const keywords = mergeKeywords(vertical, signal);
  if (keywords.length > 0) {
    const hit = keywords.some((k) => combined.includes(k.toLowerCase()));
    if (!hit) return { ok: false, reason: "keyword_no_match" };
  }

  return { ok: true };
}

function senderMatches(fromHeader: string, config: GmailInputConfig): boolean {
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
  let text = raw;
  if (htmlMatch || raw.includes("<")) {
    try {
      text = convert(raw, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }] });
    } catch {
      text = quickPlainText(raw);
    }
  } else {
    text = quickPlainText(raw);
  }
  text = stripTrackingNoise(text);
  if (!scanBody) {
    const lines = text.split("\n");
    text = lines.slice(0, 5).join("\n");
  }
  return text.slice(0, env.maxBodyChars);
}

function stripTrackingNoise(text: string): string {
  let t = text;
  const footerPatterns = [
    /unsubscribe/gi,
    /view in browser/gi,
    /privacy policy/gi,
    /you received this email/gi,
  ];
  for (const p of footerPatterns) {
    const idx = t.search(p);
    if (idx > 200 && idx < t.length * 0.85) {
      t = t.slice(0, idx);
    }
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

export function computeRelevanceScore(
  text: string,
  keywords: string[],
  dateMs: number,
): number {
  const kd = keywordDensityScore(text, keywords);
  const promo = heuristicPromoScore(text);
  const rec = recencyScore(dateMs);
  const score = kd + promo + rec;
  return Math.round(Math.min(score, 1) * 1000) / 1000;
}

export function buildMinimalSignalItem(
  vertical: Vertical,
  signal: InputSignal,
  normalized: NormalizedMessage,
  skipReason: string,
): SignalItem {
  const extracted = extractAndTruncate(normalized.raw_content, signal.config.scan_body).slice(0, 2000);
  const kws = mergeKeywords(vertical, signal);
  const detected = detectKeywords(extracted, kws);
  return {
    id: randomUUID(),
    vertical_id: vertical.id,
    input_signal_id: signal.id,
    source_type: SOURCE_TYPE_EMAIL_GMAIL,
    source_name: signal.name,
    title: normalized.subject,
    raw_content: normalized.raw_content.slice(0, 50_000),
    extracted_text: extracted,
    detected_keywords: detected,
    relevance_score: 0.05,
    original_url: normalized.links[0] ?? null,
    external_id: normalized.external_id,
    ai_summary: null,
    ai_processed: false,
    skip_reason: skipReason,
    created_at: new Date(),
  };
}

export function buildFullSignalItem(
  vertical: Vertical,
  signal: InputSignal,
  normalized: NormalizedMessage,
  extractedText: string,
  aiSummary: string,
  deal_metrics?: DealMetrics,
): SignalItem {
  const kws = mergeKeywords(vertical, signal);
  const detected = detectKeywords(extractedText, kws);
  const relevance = computeRelevanceScore(extractedText, kws, normalized.dateMs);
  const trimmed = aiSummary.trim();
  const base: SignalItem = {
    id: randomUUID(),
    vertical_id: vertical.id,
    input_signal_id: signal.id,
    source_type: SOURCE_TYPE_EMAIL_GMAIL,
    source_name: signal.name,
    title: normalized.subject,
    raw_content: normalized.raw_content.slice(0, 50_000),
    extracted_text: extractedText,
    detected_keywords: detected,
    relevance_score: relevance,
    original_url: normalized.links[0] ?? null,
    external_id: normalized.external_id,
    ai_summary: trimmed || null,
    ai_processed: Boolean(trimmed),
    skip_reason: null,
    created_at: new Date(),
  };
  return deal_metrics ? { ...base, deal_metrics } : base;
}
