import type { DealMetrics } from "@content-resourcer/db";
import OpenAI from "openai";
import { env } from "./env.js";

function formatDealLine(dm: DealMetrics): string {
  const pay =
    dm.you_pay != null
      ? dm.pay_unit === "USD"
        ? `$${dm.you_pay}`
        : `${dm.you_pay}${dm.pay_unit ? ` ${dm.pay_unit}` : ""}`
      : null;
  const credit =
    dm.baseline_value != null
      ? dm.credit_unit === "USD"
        ? `$${dm.baseline_value}`
        : `${dm.baseline_value}${dm.credit_unit ? ` ${dm.credit_unit}` : ""}`
      : null;
  const amounts = pay && credit ? `${pay} → ${credit}` : pay ?? credit ?? "promotional offer";
  if (dm.units_comparable === false && dm.bonus_pct != null) {
    return `${amounts} (~${Math.round(dm.bonus_pct * 100)}% bonus)`;
  }
  const pct = Math.round(Math.max(dm.effective_savings_pct ?? 0, dm.bonus_pct ?? 0) * 100);
  return `${amounts} (~${pct}% deal strength)`;
}

export async function generateSocialPostCopy(opts: {
  title: string;
  summary?: string | null;
  senderFrom?: string;
  deal: DealMetrics;
  signalName?: string;
}): Promise<string> {
  if (!env.openaiApiKey) {
    const dealLine = formatDealLine(opts.deal);
    return `${opts.title}\n\n${dealLine}${opts.summary ? `\n\n${opts.summary}` : ""}`.trim();
  }

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const dealLine = formatDealLine(opts.deal);
  const userParts = [
    `Email subject: ${opts.title}`,
    opts.senderFrom ? `From: ${opts.senderFrom}` : null,
    opts.signalName ? `Content signal: ${opts.signalName}` : null,
    `Deal tier: ${dealLine}`,
    opts.summary ? `Summary: ${opts.summary}` : null,
  ].filter(Boolean);

  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensSocialPost,
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content: `Write a short social media post promoting this casino/promotional deal email.
Rules:
- Lead with the deal hook (price → value/bonus).
- Keep the main post under 280 characters when possible; you may add one short follow-up sentence after a blank line if needed.
- Friendly, urgent promotional tone. No hashtags unless natural (max 2).
- Do NOT invent URLs, promo codes, or deadlines not in the input.
- Do NOT use markdown. Plain text only.`,
      },
      { role: "user", content: userParts.join("\n") },
    ],
  });

  return res.choices[0]?.message?.content?.trim() ?? dealLine;
}

export { formatDealLine };
