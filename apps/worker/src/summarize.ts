import type { DealMetricsMode, KeyPoint, KeyPointCategory } from "@content-resourcer/db";
import { expandKeyPoints, normalizeKeyPointCategory } from "@content-resourcer/db";
import OpenAI from "openai";
import type { DealMetricsLlmPartial } from "./deal-metrics.js";
import { env } from "./env.js";

const DEAL_MODES = new Set<string>(["retail_list_vs_sale", "pay_vs_credited_value", "unknown"]);

function normalizeMode(m: unknown): DealMetricsMode {
  return typeof m === "string" && DEAL_MODES.has(m) ? (m as DealMetricsMode) : "unknown";
}

export async function summarizeEmailBody(cleanText: string): Promise<string> {
  if (!env.openaiApiKey) {
    return "";
  }
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const input = cleanText.slice(0, env.maxAiInputChars);
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensSummary,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "Summarize the marketing or promotional email in 1–3 concise sentences. Focus on offers, deadlines, and key actions. No preamble.",
      },
      { role: "user", content: input },
    ],
  });
  const text = res.choices[0]?.message?.content?.trim() ?? "";
  return text;
}

/**
 * Structured pass: dollars paid vs baseline (list price or credited package value).
 * `dealUnitTokens` are user-defined labels (e.g. SC, FP, $) to prefer when reading amounts.
 */
export async function extractDealMetricsWithLlm(
  cleanText: string,
  dealUnitTokens: readonly string[] = [],
): Promise<DealMetricsLlmPartial | null> {
  if (!env.openaiApiKey) {
    return null;
  }
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const input = cleanText.slice(0, env.maxAiInputChars);
  const unitLine =
    dealUnitTokens.length > 0
      ? `User-defined amount units (tokens/suffixes near numbers, including $ if listed): ${dealUnitTokens.join(", ")}. Prefer interpreting numeric offers using these units when they appear beside amounts.`
      : "No custom units provided; infer USD ($) or generic promotional amounts.";
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensDeal,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract promotional economics from the email. Reply with JSON only:
{"you_pay": number|null,"baseline_value": number|null,"pay_unit": string|null,"credit_unit": string|null,"mode":"retail_list_vs_sale"|"pay_vs_credited_value"|"unknown","confidence": number}
Rules:
${unitLine}
- you_pay: what the customer pays today. null if unclear.
- pay_unit: unit for you_pay (e.g. USD, $, SC, FC). Use USD when the amount is in dollars.
- baseline_value: for retail_list_vs_sale, regular/list/strike price before discount. For pay_vs_credited_value, the credited/pack amount in the SAME unit as stated in the email (e.g. 26 when the offer says "26 SC"), NOT marketing "total worth" or inflated package value. Must be greater than you_pay when both set. null if unclear.
- credit_unit: unit for baseline_value / credited amount (e.g. SC, FC, USD). null if unclear.
- If pay is USD ($) and credited amount is in SC/FC/custom tokens without a clear USD equivalent for that credit, set baseline_value to null.
- mode: retail_list_vs_sale for list vs sale; pay_vs_credited_value when comparing cash paid to credited/pack value; unknown otherwise.
- confidence: 0–1 how reliable the numbers are; use low values when guessing or units are mixed.
- When multiple purchase tiers are listed (e.g. several "Gold Coins for $X + Y Free SC" bundles), extract metrics for ONE tier only — never combine the lowest price with the highest credit from different tiers.`,
      },
      { role: "user", content: input },
    ],
  });
  let raw = res.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) return null;
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fenced) raw = fenced[1]!.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const you_pay = typeof o.you_pay === "number" && Number.isFinite(o.you_pay) && o.you_pay > 0 ? o.you_pay : null;
  const baseline_value =
    typeof o.baseline_value === "number" && Number.isFinite(o.baseline_value) && o.baseline_value > 0
      ? o.baseline_value
      : null;
  const confidence =
    typeof o.confidence === "number" && Number.isFinite(o.confidence)
      ? Math.min(1, Math.max(0, o.confidence))
      : 0.35;
  const pay_unit =
    typeof o.pay_unit === "string" && o.pay_unit.trim() ? o.pay_unit.trim() : null;
  const credit_unit =
    typeof o.credit_unit === "string" && o.credit_unit.trim() ? o.credit_unit.trim() : null;
  return {
    you_pay,
    baseline_value,
    pay_unit,
    credit_unit,
    mode: normalizeMode(o.mode),
    confidence,
  };
}

const KEY_POINT_PATTERN_GROUPS: { category: KeyPointCategory; re: RegExp }[] = [
  { category: "deadline", re: /\b(?:must\s+)?claim\s+(?:by|before)\s+[^.\n]{4,120}/gi },
  { category: "deadline", re: /\b(?:valid|available)\s+(?:until|through|from)\s+[^.\n]{4,120}/gi },
  { category: "terms", re: /\b(?:no\s+purchase\s+necessary)\b/gi },
  { category: "terms", re: /\bvoid\s+where\s+prohibited\b/gi },
  { category: "eligibility", re: /\b(?:not\s+)?available\s+in\s+(?:all\s+)?states?\b/gi },
  {
    category: "deadline",
    re: /\b(?:May|June|July|August|September|October|November|December|January|February|March|April)\s+\d{1,2}(?:\s*[-–]\s*(?:May|June|July|August|September|October|November|December|January|February|March|April)?\s*\d{1,2})?(?:\s*\([^)]+\))?/gi,
  },
  { category: "deadline", re: /\b\d{1,2}:\d{2}\s*(?:am|pm)\s*(?:ET|PT|PST|EST|CT)\b/gi },
  { category: "deadline", re: /\b(?:tournament|promo|offer|deal)\s+(?:runs?|from)\s+[^.\n]{4,100}/gi },
];

function parseKeyPointsFromLlmArray(items: unknown[]): KeyPoint[] {
  const out: KeyPoint[] = [];
  const seen = new Set<string>();
  for (const x of items) {
    if (typeof x === "string") {
      const text = x.trim().slice(0, 500);
      if (!text) continue;
      const key = `other:${text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ category: "other", text });
      continue;
    }
    if (!x || typeof x !== "object") continue;
    const o = x as { category?: unknown; text?: unknown };
    const text = typeof o.text === "string" ? o.text.trim().slice(0, 500) : "";
    if (!text) continue;
    const category = normalizeKeyPointCategory(o.category);
    const key = `${category}:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ category, text });
    if (out.length >= 16) break;
  }
  return out;
}

export function extractKeyPointsRegexFallback(cleanText: string, subject = ""): KeyPoint[] {
  const combined = `${subject}\n${cleanText}`.slice(0, env.maxAiInputChars);
  const seen = new Set<string>();
  const out: KeyPoint[] = [];

  for (const { category, re } of KEY_POINT_PATTERN_GROUPS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(combined)) !== null && out.length < 16) {
      const s = m[0].replace(/\s+/g, " ").trim();
      if (s.length < 8 || s.length > 500) continue;
      const key = `${category}:${s.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        category,
        text: s.charAt(0).toUpperCase() + s.slice(1),
      });
    }
  }
  return expandKeyPoints(out);
}

export async function extractKeyPointsWithLlm(
  cleanText: string,
  subject = "",
): Promise<KeyPoint[]> {
  if (!env.openaiApiKey) {
    return extractKeyPointsRegexFallback(cleanText, subject);
  }
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const input = `${subject ? `Subject: ${subject}\n\n` : ""}${cleanText}`.slice(0, env.maxAiInputChars);
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: 500,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract atomic factual data points from this promotional email as JSON only:
{"key_points": [{"category": string, "text": string}]}
Rules:
- Return 4–16 objects when present; empty array if none.
- ONE fact per object. Never combine multiple facts with semicolons.
- category must be one of: deadline, eligibility, offer, requirement, terms, other
  - deadline: dates, claim-by, valid until, tournament/promo windows
  - eligibility: states, age, who can participate
  - offer: bonus %, price tiers, credited amounts, package names
  - requirement: purchase steps, claim steps, minimum spend
  - terms: legal (void where prohibited, no purchase necessary)
  - other: remaining concrete facts
- text: under 120 chars, use the email's own dates and wording
- No marketing fluff or generic CTAs`,
      },
      { role: "user", content: input },
    ],
  });
  let raw = res.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) return extractKeyPointsRegexFallback(cleanText, subject);
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fenced) raw = fenced[1]!.trim();
  try {
    const parsed = JSON.parse(raw) as { key_points?: unknown };
    if (!Array.isArray(parsed.key_points)) {
      return extractKeyPointsRegexFallback(cleanText, subject);
    }
    const out = parseKeyPointsFromLlmArray(parsed.key_points);
    const expanded = expandKeyPoints(out);
    return expanded.length ? expanded : extractKeyPointsRegexFallback(cleanText, subject);
  } catch {
    return extractKeyPointsRegexFallback(cleanText, subject);
  }
}
