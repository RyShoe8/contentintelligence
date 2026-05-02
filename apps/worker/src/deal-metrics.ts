import type { DealMetrics, DealMetricsMode, DealMetricsSource } from "@content-resourcer/db";

export type DealMetricsLlmPartial = {
  you_pay: number | null;
  baseline_value: number | null;
  mode: DealMetricsMode;
  confidence: number;
};

function parseMoney(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clampSavings(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(0.99, Math.max(0, pct));
}

function reEsc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build case-insensitive suffix alternation for unit tokens (excludes bare `$`, handled as currency). */
export function buildUnitSuffixPattern(unitTokens: readonly string[]): string | null {
  const parts = unitTokens
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t !== "$")
    .map((t) => reEsc(t));
  if (parts.length === 0) return null;
  return `(?:${parts.join("|")})`;
}

/** Build deal_metrics when you_pay and baseline_value are known (you_pay < baseline for a “deal”). */
export function buildDealMetricsFromAmounts(
  youPay: number,
  baseline: number,
  mode: DealMetricsMode,
  confidence: number,
  source: DealMetricsSource,
): DealMetrics | null {
  if (!(youPay > 0) || !(baseline > 0) || baseline <= youPay) return null;
  const effective_savings_pct = clampSavings(1 - youPay / baseline);
  const value_ratio = baseline / youPay;
  return {
    mode,
    you_pay: youPay,
    baseline_value: baseline,
    effective_savings_pct,
    value_ratio,
    confidence: Math.min(1, Math.max(0, confidence)),
    source,
  };
}

const MONEY = "([\\d,]+(?:\\.\\d{1,2})?)";

function tryUnitPair(
  text: string,
  suf: string,
  confidence: number,
): DealMetrics | null {
  const NUM_SUF = `${MONEY}\\s*${suf}\\b`;
  const payDollar = `(?:\\$)?${MONEY}\\b`;

  const getFor = new RegExp(
    `\\b(?:get|receive|worth|value(?:\\s+of)?)\\s*${NUM_SUF}[\\s\\S]{0,100}?(?:for|only|just)\\s*${payDollar}`,
    "i",
  );
  let m = getFor.exec(text);
  if (m) {
    const credited = parseMoney(m[1]!);
    const pay = parseMoney(m[2]!);
    if (credited != null && pay != null && credited > pay) {
      return buildDealMetricsFromAmounts(pay, credited, "pay_vs_credited_value", confidence, "regex");
    }
  }

  const forGet = new RegExp(
    `\\b(?:for|only|just)\\s*${payDollar}[\\s\\S]{0,120}?(?:get|receive|worth)\\s*${NUM_SUF}`,
    "i",
  );
  m = forGet.exec(text);
  if (m) {
    const pay = parseMoney(m[1]!);
    const credited = parseMoney(m[2]!);
    if (pay != null && credited != null && credited > pay) {
      return buildDealMetricsFromAmounts(pay, credited, "pay_vs_credited_value", confidence - 0.05, "regex");
    }
  }

  const payGet = new RegExp(
    `\\b(?:pay|buy|deposit)\\s*${payDollar}[\\s\\S]{0,120}?(?:get|receive|worth)\\s*${NUM_SUF}`,
    "i",
  );
  m = payGet.exec(text);
  if (m) {
    const pay = parseMoney(m[1]!);
    const credited = parseMoney(m[2]!);
    if (pay != null && credited != null && credited > pay) {
      return buildDealMetricsFromAmounts(pay, credited, "pay_vs_credited_value", confidence, "regex");
    }
  }

  return null;
}

/**
 * Conservative regex/heuristic pass on subject + body.
 * `unitTokens` adds patterns like `500 SC` when tokens include `SC`.
 */
export function extractDealMetricsRegex(
  subject: string,
  body: string,
  unitTokens: readonly string[] = [],
): DealMetrics | null {
  const text = `${subject}\n${body}`.replace(/\s+/g, " ");

  const suf = buildUnitSuffixPattern(unitTokens);
  if (suf) {
    const fromUnits = tryUnitPair(text, suf, 0.52);
    if (fromUnits) return fromUnits;
  }

  const wasNow = new RegExp(
    `was\\s*\\$?${MONEY}\\b[\\s\\S]{0,120}?(?:now|only|just|from)\\s*\\$?${MONEY}\\b`,
    "i",
  );
  let m = wasNow.exec(text);
  if (m) {
    const high = parseMoney(m[1]!);
    const low = parseMoney(m[2]!);
    if (high != null && low != null && high > low) {
      return buildDealMetricsFromAmounts(low, high, "retail_list_vs_sale", 0.55, "regex");
    }
  }

  const getFor = new RegExp(
    `\\b(?:get|receive|worth|value(?:\\s+of)?)\\s*\\$?${MONEY}\\b[\\s\\S]{0,80}?(?:for|only|just)\\s*\\$?${MONEY}\\b`,
    "i",
  );
  m = getFor.exec(text);
  if (m) {
    const credited = parseMoney(m[1]!);
    const pay = parseMoney(m[2]!);
    if (credited != null && pay != null && credited > pay) {
      return buildDealMetricsFromAmounts(pay, credited, "pay_vs_credited_value", 0.5, "regex");
    }
  }

  const forOnlyGet = new RegExp(
    `\\b(?:for|only|just)\\s*\\$?${MONEY}\\b[\\s\\S]{0,100}?(?:get|receive|worth)\\s*\\$?${MONEY}\\b`,
    "i",
  );
  m = forOnlyGet.exec(text);
  if (m) {
    const pay = parseMoney(m[1]!);
    const credited = parseMoney(m[2]!);
    if (pay != null && credited != null && credited > pay) {
      return buildDealMetricsFromAmounts(pay, credited, "pay_vs_credited_value", 0.45, "regex");
    }
  }

  const payGet = new RegExp(
    `\\b(?:pay|buy|deposit)\\s*\\$?${MONEY}\\b[\\s\\S]{0,100}?(?:get|receive|worth)\\s*\\$?${MONEY}\\b`,
    "i",
  );
  m = payGet.exec(text);
  if (m) {
    const pay = parseMoney(m[1]!);
    const credited = parseMoney(m[2]!);
    if (pay != null && credited != null && credited > pay) {
      return buildDealMetricsFromAmounts(pay, credited, "pay_vs_credited_value", 0.55, "regex");
    }
  }

  return null;
}

function dealFromLlmPartial(p: DealMetricsLlmPartial, source: DealMetricsSource): DealMetrics | null {
  const y = p.you_pay;
  const b = p.baseline_value;
  if (y == null || b == null) return null;
  return buildDealMetricsFromAmounts(y, b, p.mode ?? "unknown", p.confidence, source);
}

/**
 * Prefer LLM when it returns a valid pair with decent confidence; otherwise regex; merge when both agree roughly.
 */
export function mergeDealExtractions(
  llm: DealMetricsLlmPartial | null,
  regex: DealMetrics | null,
): DealMetrics | undefined {
  const fromLlm = llm ? dealFromLlmPartial(llm, "llm") : null;
  if (fromLlm && (llm!.confidence >= 0.45 || !regex)) {
    if (regex && fromLlm.effective_savings_pct > 0) {
      const agree =
        fromLlm.you_pay != null &&
        regex.you_pay != null &&
        fromLlm.baseline_value != null &&
        regex.baseline_value != null &&
        Math.abs(fromLlm.you_pay - regex.you_pay) / Math.max(fromLlm.you_pay, regex.you_pay) < 0.15 &&
        Math.abs(fromLlm.baseline_value - regex.baseline_value) /
          Math.max(fromLlm.baseline_value, regex.baseline_value) <
          0.15;
      if (agree) {
        return {
          ...fromLlm,
          confidence: Math.min(1, (fromLlm.confidence + regex.confidence) / 2 + 0.1),
          source: "merged",
        };
      }
    }
    return fromLlm;
  }
  if (regex) return regex;
  if (fromLlm) return fromLlm;
  return undefined;
}
