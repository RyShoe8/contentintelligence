import type { DealMetrics, GenerationConstraints } from "@content-resourcer/db";
import OpenAI from "openai";
import { formatConstraintsForPrompt } from "./services/constraints/assemble-generation-constraints.js";
import { env } from "./env.js";
import {
  buildVoiceStylePromptLines,
  formatPreferredLinksForUserMessage,
  sanitizeVoicePostCopy,
  type VoiceSocialLinkLike,
  type VoiceStylePromptOpts,
} from "./voice-style-rules.js";

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

function styleRulesBlock(style: VoiceStylePromptOpts): string {
  const lines = buildVoiceStylePromptLines(style);
  return lines.length ? `\n${lines.join("\n")}` : "";
}

function buildConstraintSystemPrompt(
  constraints: GenerationConstraints,
  contentOnly: boolean,
  style: VoiceStylePromptOpts,
): string {
  const leadRule = contentOnly
    ? "- Lead with the most newsworthy or interesting hook from the email."
    : "- Lead with the deal hook (price → value/bonus).";
  return `Write a short social media post promoting this ${contentOnly ? "email content" : "deal email"} using the structured brand constraints below.
Rules:
- Follow positioning, audience relationship, and emotional baseline exactly.
- Apply rhetorical patterns consistently.
- Respect all taboos and avoid sounding like the "doesNotSoundLike" list.
- Use favorite phrases and recurring topics naturally when relevant (do not force all of them).
${leadRule}
- Keep the main post under 280 characters when possible; you may add one short follow-up sentence after a blank line if needed.
- Do NOT invent URLs, promo codes, or deadlines not in the input.
- Do NOT use markdown. Plain text only.${styleRulesBlock(style)}

Brand generation constraints (JSON):
${formatConstraintsForPrompt(constraints)}`;
}

export async function generateSocialPostCopy(opts: {
  title: string;
  summary?: string | null;
  senderFrom?: string;
  deal?: DealMetrics | null;
  signalName?: string;
  brandName?: string;
  preferredPhrases?: string[];
  preferredLinks?: VoiceSocialLinkLike[];
  persona?: string;
  constraints?: GenerationConstraints;
}): Promise<string> {
  const contentOnly = !opts.deal;
  const style: VoiceStylePromptOpts = {
    brandName: opts.brandName,
    preferredPhrases: opts.preferredPhrases,
    preferredLinks: opts.preferredLinks,
  };

  if (!env.openaiApiKey) {
    let copy: string;
    if (contentOnly) {
      copy = `${opts.title}${opts.summary ? `\n\n${opts.summary}` : ""}`.trim();
    } else {
      const dealLine = formatDealLine(opts.deal!);
      copy = `${opts.title}\n\n${dealLine}${opts.summary ? `\n\n${opts.summary}` : ""}`.trim();
    }
    return sanitizeVoicePostCopy(copy);
  }

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const dealLine = opts.deal ? formatDealLine(opts.deal) : null;
  const userParts = [
    `Email subject: ${opts.title}`,
    opts.senderFrom ? `From: ${opts.senderFrom}` : null,
    opts.signalName ? `Content signal: ${opts.signalName}` : null,
    dealLine ? `Deal tier: ${dealLine}` : null,
    opts.summary ? `Summary: ${opts.summary}` : null,
    opts.preferredLinks?.length
      ? formatPreferredLinksForUserMessage(opts.preferredLinks)
      : null,
  ].filter(Boolean);

  const systemPrompt = opts.constraints
    ? buildConstraintSystemPrompt(opts.constraints, contentOnly, style)
    : opts.persona?.trim()
      ? `Write a short social media post promoting this ${contentOnly ? "email content" : "deal email"} using the brand voice persona below.
Rules:
- Follow the persona's tone, vocabulary, and formatting habits.
${contentOnly ? "- Lead with the most newsworthy or interesting hook from the email." : "- Lead with the deal hook (price → value/bonus)."}
- Keep the main post under 280 characters when possible; you may add one short follow-up sentence after a blank line if needed.
- Do NOT invent URLs, promo codes, or deadlines not in the input.
- Do NOT use markdown. Plain text only.${styleRulesBlock(style)}

Brand voice persona:
${opts.persona.trim()}`
      : contentOnly
        ? `Write a short social media post promoting this promotional email content.
Rules:
- Lead with the most newsworthy or interesting hook from the email.
- Keep the main post under 280 characters when possible; you may add one short follow-up sentence after a blank line if needed.
- Friendly, informative promotional tone. No hashtags unless natural (max 2).
- Do NOT invent URLs, promo codes, or deadlines not in the input.
- Do NOT use markdown. Plain text only.${styleRulesBlock(style)}`
        : `Write a short social media post promoting this casino/promotional deal email.
Rules:
- Lead with the deal hook (price → value/bonus).
- Keep the main post under 280 characters when possible; you may add one short follow-up sentence after a blank line if needed.
- Friendly, urgent promotional tone. No hashtags unless natural (max 2).
- Do NOT invent URLs, promo codes, or deadlines not in the input.
- Do NOT use markdown. Plain text only.${styleRulesBlock(style)}`;

  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensSocialPost,
    temperature: opts.constraints ? 0.35 : 0.5,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      { role: "user", content: userParts.join("\n") },
    ],
  });

  const fallback = contentOnly ? opts.title : dealLine ?? opts.title;
  const raw = res.choices[0]?.message?.content?.trim() ?? fallback;
  return sanitizeVoicePostCopy(raw);
}

export { formatDealLine };
