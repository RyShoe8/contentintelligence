import type { DealMetrics, DealMetricsMode, DealMetricsSource } from "@content-resourcer/db";

export type DealMetricsLlmPartial = {
  you_pay: number | null;
  baseline_value: number | null;
  pay_unit?: string | null;
  credit_unit?: string | null;
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

/** Normalize currency/unit labels for comparison. */
export function normalizeUnit(unit: string | undefined | null): string {
  if (!unit) return "USD";
  const t = unit.trim().toUpperCase();
  if (t === "$" || t === "USD" || t === "DOLLAR" || t === "DOLLARS") return "USD";
  return t;
}

export function unitsAreComparable(payUnit: string, creditUnit: string): boolean {
  return normalizeUnit(payUnit) === normalizeUnit(creditUnit);
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

/** Deal detected but pay/credit units differ (e.g. USD vs SC) — not used for min-deal filters. */
function buildIncomparableDealMetrics(
  youPay: number,
  baseline: number,
  mode: DealMetricsMode,
  confidence: number,
  source: DealMetricsSource,
  payUnit: string,
  creditUnit: string,
): DealMetrics {
  const bonus_pct =
    youPay > 0 && baseline > youPay ? clampSavings((baseline - youPay) / youPay) : undefined;
  return {
    mode,
    you_pay: youPay,
    baseline_value: baseline,
    pay_unit: normalizeUnit(payUnit),
    credit_unit: normalizeUnit(creditUnit),
    units_comparable: false,
    effective_savings_pct: 0,
    bonus_pct,
    confidence: Math.min(0.4, Math.max(0, confidence)),
    source,
  };
}

/** Build deal_metrics when you_pay and baseline_value are known (you_pay < baseline for a “deal”). */
export function buildDealMetricsFromAmounts(
  youPay: number,
  baseline: number,
  mode: DealMetricsMode,
  confidence: number,
  source: DealMetricsSource,
  payUnit?: string,
  creditUnit?: string,
): DealMetrics | null {
  if (!(youPay > 0) || !(baseline > 0) || baseline <= youPay) return null;

  const payU = normalizeUnit(payUnit ?? "USD");
  const creditU = normalizeUnit(creditUnit ?? payU);

  if (!unitsAreComparable(payU, creditU)) {
    return buildIncomparableDealMetrics(youPay, baseline, mode, confidence, source, payU, creditU);
  }

  const effective_savings_pct = clampSavings(1 - youPay / baseline);
  const bonus_pct = clampSavings((baseline - youPay) / youPay);
  const value_ratio = baseline / youPay;
  return {
    mode,
    you_pay: youPay,
    baseline_value: baseline,
    pay_unit: payU,
    credit_unit: creditU,
    units_comparable: true,
    effective_savings_pct,
    bonus_pct,
    value_ratio,
    confidence: Math.min(1, Math.max(0, confidence)),
    source,
  };
}

const MONEY = "([\\d,]+(?:\\.\\d{1,2})?)";

function tryUnitPair(
  text: string,
  suf: string,
  creditUnitLabel: string,
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
      return buildIncomparableDealMetrics(
        pay,
        credited,
        "pay_vs_credited_value",
        confidence,
        "regex",
        "USD",
        creditUnitLabel,
      );
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
      return buildIncomparableDealMetrics(
        pay,
        credited,
        "pay_vs_credited_value",
        confidence - 0.05,
        "regex",
        "USD",
        creditUnitLabel,
      );
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
      return buildIncomparableDealMetrics(
        pay,
        credited,
        "pay_vs_credited_value",
        confidence,
        "regex",
        "USD",
        creditUnitLabel,
      );
    }
  }

  return null;
}

/** First non-$ unit token label for cross-unit regex (e.g. SC). */
function primaryCreditUnitLabel(unitTokens: readonly string[]): string {
  const t = unitTokens.map((x) => x.trim()).find((x) => x.length > 0 && x !== "$");
  return t ?? "TOKEN";
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

  if (unitTokens.length > 0) {
    const fromPurchase = tryPurchasePackageUsdToToken(text, unitTokens);
    if (fromPurchase) return fromPurchase;
  }

  const suf = buildUnitSuffixPattern(unitTokens);
  if (suf) {
    const creditLabel = primaryCreditUnitLabel(unitTokens);
    const fromUnits = tryUnitPair(text, suf, creditLabel, 0.52);
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
      return buildDealMetricsFromAmounts(low, high, "retail_list_vs_sale", 0.55, "regex", "USD", "USD");
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
      return buildDealMetricsFromAmounts(pay, credited, "pay_vs_credited_value", 0.5, "regex", "USD", "USD");
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
      return buildDealMetricsFromAmounts(pay, credited, "pay_vs_credited_value", 0.45, "regex", "USD", "USD");
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
      return buildDealMetricsFromAmounts(pay, credited, "pay_vs_credited_value", 0.55, "regex", "USD", "USD");
    }
  }

  return null;
}

function dealFromLlmPartial(p: DealMetricsLlmPartial, source: DealMetricsSource): DealMetrics | null {
  const y = p.you_pay;
  const b = p.baseline_value;
  if (y == null || b == null) return null;
  return buildDealMetricsFromAmounts(
    y,
    b,
    p.mode ?? "unknown",
    p.confidence,
    source,
    p.pay_unit ?? undefined,
    p.credit_unit ?? undefined,
  );
}

/**
 * Prefer LLM when it returns a valid pair with decent confidence; otherwise regex; merge when both agree roughly.
 */
export function mergeDealExtractions(
  llm: DealMetricsLlmPartial | null,
  regex: DealMetrics | null,
): DealMetrics | undefined {
  if (regex?.units_comparable === false) {
    return regex;
  }

  const fromLlm = llm ? dealFromLlmPartial(llm, "llm") : null;

  if (fromLlm?.units_comparable === false) {
    return fromLlm;
  }

  if (fromLlm && (llm!.confidence >= 0.45 || !regex)) {
    if (regex && fromLlm.units_comparable && fromLlm.effective_savings_pct > 0) {
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

/** Max filterable deal strength (for tests and sorting helpers). */
export function dealStrengthPct(dm: DealMetrics): number {
  const savings = dm.units_comparable === false ? 0 : (dm.effective_savings_pct ?? 0);
  const bonus = dm.bonus_pct ?? 0;
  return Math.max(savings, bonus);
}

function extractTokenCreditAmount(text: string, token: string): number | null {
  const suf = reEsc(token);
  const freeBefore = new RegExp(`(${MONEY})\\s+FREE\\s*${suf}\\b`, "i").exec(text);
  if (freeBefore) return parseMoney(freeBefore[1]!);
  const freeAfter = new RegExp(`FREE\\s+(${MONEY})\\s*${suf}\\b`, "i").exec(text);
  if (freeAfter) return parseMoney(freeAfter[1]!);
  const matches = [...text.matchAll(new RegExp(`(${MONEY})\\s*${suf}\\b`, "gi"))];
  if (matches.length === 0) return null;
  return parseMoney(matches[matches.length - 1]![1]!);
}

/** purchase $20 package ... receive 26 FREE SC (USD pay, token credit). */
function tryPurchasePackageUsdToToken(
  text: string,
  unitTokens: readonly string[],
): DealMetrics | null {
  const payM =
    /\$\s*([\d,]+(?:\.\d{1,2})?)\s+package\b/i.exec(text) ??
    /\b(?:purchase|buy)\b[\s\S]{0,120}?\$\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (!payM) return null;
  const pay = parseMoney(payM[1]!);
  if (pay == null) return null;

  const ordered = [...unitTokens].sort((a, b) => {
    const au = a.trim().toUpperCase();
    const bu = b.trim().toUpperCase();
    if (au === "SC") return -1;
    if (bu === "SC") return 1;
    if (au === "FC") return -1;
    if (bu === "FC") return 1;
    return 0;
  });

  let best: DealMetrics | null = null;
  for (const raw of ordered) {
    const token = raw.trim();
    if (!token || token === "$") continue;
    const credited = extractTokenCreditAmount(text, token);
    if (credited == null || credited <= pay) continue;
    const candidate = buildIncomparableDealMetrics(
      pay,
      credited,
      "pay_vs_credited_value",
      0.5,
      "regex",
      "USD",
      token,
    );
    if (credited > pay * 50) continue;
    if (!best || (best.baseline_value ?? 0) > credited) {
      best = candidate;
    }
  }
  return best;
}
