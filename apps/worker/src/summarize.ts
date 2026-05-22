import type { DealMetricsMode } from "@content-resourcer/db";
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
