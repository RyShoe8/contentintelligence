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
{"you_pay": number|null,"baseline_value": number|null,"mode":"retail_list_vs_sale"|"pay_vs_credited_value"|"unknown","confidence": number}
Rules:
${unitLine}
- you_pay: what the customer pays today in USD (or clear USD equivalent). null if unclear.
- baseline_value: for retail, regular/list/strike price before discount. For bundles/casino-style offers, total advertised dollar value of credits/coins/package worth (not bonus multipliers alone). Must be greater than you_pay when both set. null if unclear.
- mode: retail_list_vs_sale for list vs sale; pay_vs_credited_value when comparing cash paid to credited/pack value; unknown otherwise.
- confidence: 0–1 how reliable the numbers are; use low values when guessing.`,
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
  return {
    you_pay,
    baseline_value,
    mode: normalizeMode(o.mode),
    confidence,
  };
}
