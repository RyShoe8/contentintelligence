import type { DealMetrics, GenerationConstraints, SocialPlatformId } from "@content-resourcer/db";
import { getSocialPlatform, primarySocialCopy, truncateForPlatform } from "@content-resourcer/db";
import OpenAI from "openai";
import { formatConstraintsForPrompt } from "./services/constraints/assemble-generation-constraints.js";
import { env } from "./env.js";
import {
  buildVoiceStylePromptLines,
  formatPreferredPhrasesForUserMessage,
  sanitizeVoicePostCopy,
  type VoicePreferredPhraseLike,
  type VoiceStylePromptOpts,
} from "./voice-style-rules.js";

export type GenerateSocialPostOpts = {
  title: string;
  summary?: string | null;
  senderFrom?: string;
  deal?: DealMetrics | null;
  signalName?: string;
  brandName?: string;
  brandMentionLevel?: number;
  contentProviderName?: string;
  sourcesInPostsLevel?: number;
  preferredPhrases?: VoicePreferredPhraseLike[];
  dealUrl?: string | null;
  persona?: string;
  constraints?: GenerationConstraints;
  platform?: SocialPlatformId;
};

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

function lengthRule(platform?: SocialPlatformId): string {
  if (platform) {
    const max = getSocialPlatform(platform).maxChars;
    return `- Keep the entire post under ${max} characters (hard limit). You may add one short follow-up line after a blank line only if the total still fits.`;
  }
  return `- Keep the main post under 280 characters when possible; you may add one short follow-up sentence after a blank line if needed.`;
}

function platformRulesBlock(platform: SocialPlatformId): string {
  const p = getSocialPlatform(platform);
  return `
Target platform: ${p.label}
- Hard maximum length: ${p.maxChars} characters.
- Platform rules: ${p.promptRules}`;
}

function sharedIdentityBlock(constraints: GenerationConstraints): string {
  const s = constraints.sharedIdentity;
  if (!s) return "";
  const lines = [
    "",
    "Shared identity (copy + visuals must align):",
    s.audienceType ? `- Audience: ${s.audienceType}` : null,
    s.internetCultureAlignment ? `- Culture: ${s.internetCultureAlignment}` : null,
    s.energyProfile ? `- Energy: ${s.energyProfile}` : null,
    s.trustStyle ? `- Trust: ${s.trustStyle}` : null,
    s.sophisticationLevel ? `- Sophistication: ${s.sophisticationLevel}` : null,
  ].filter((x): x is string => Boolean(x));
  return lines.length ? lines.join("\n") : "";
}

function buildConstraintSystemPrompt(
  constraints: GenerationConstraints,
  contentOnly: boolean,
  style: VoiceStylePromptOpts,
  platform?: SocialPlatformId,
): string {
  const leadRule = contentOnly
    ? "- Lead with the most newsworthy or interesting hook from the email."
    : "- Lead with the deal hook (price → value/bonus).";
  const archetypeLine = constraints.archetype
    ? `- Embody archetype: ${constraints.archetype}`
    : null;
  return `Write a short social media post promoting this ${contentOnly ? "email content" : "deal email"} using the structured brand constraints below.
Rules:
- Follow positioning, audience relationship, and emotional baseline exactly.
- Apply rhetorical patterns consistently.
- Respect all taboos and avoid sounding like the "doesNotSoundLike" list.
- Use favorite phrases and recurring topics naturally when relevant (do not force all of them).
- Frame from the audience's perspective; include interpretation or opinion, not generic hype.
${archetypeLine ?? ""}
NEVER use: "don't miss out", "maximize your fun", generic affiliate hype, fake urgency, excessive emojis.
ALWAYS sound like a recognizable personality with skepticism when the emotional baseline calls for it.
${leadRule}
${lengthRule(platform)}
- Do NOT invent URLs, promo codes, or deadlines not in the input.
- Do NOT use markdown. Plain text only.${platform ? platformRulesBlock(platform) : ""}${styleRulesBlock(style)}${sharedIdentityBlock(constraints)}

Brand generation constraints (JSON):
${formatConstraintsForPrompt(constraints)}`;
}

function buildDefaultSystemPrompt(
  contentOnly: boolean,
  style: VoiceStylePromptOpts,
  platform?: SocialPlatformId,
  persona?: string,
): string {
  const platformBlock = platform ? platformRulesBlock(platform) : "";
  if (persona?.trim()) {
    return `Write a short social media post promoting this ${contentOnly ? "email content" : "deal email"} using the brand voice persona below.
Rules:
- Follow the persona's tone, vocabulary, and formatting habits.
${contentOnly ? "- Lead with the most newsworthy or interesting hook from the email." : "- Lead with the deal hook (price → value/bonus)."}
${lengthRule(platform)}
- Do NOT invent URLs, promo codes, or deadlines not in the input.
- Do NOT use markdown. Plain text only.${platformBlock}${styleRulesBlock(style)}

Brand voice persona:
${persona.trim()}`;
  }
  if (contentOnly) {
    return `Write a short social media post promoting this promotional email content.
Rules:
- Lead with the most newsworthy or interesting hook from the email.
${lengthRule(platform)}
- Friendly, informative promotional tone. No hashtags unless natural (max 2).
- Do NOT invent URLs, promo codes, or deadlines not in the input.
- Do NOT use markdown. Plain text only.${platformBlock}${styleRulesBlock(style)}`;
  }
  return `Write a short social media post promoting this casino/promotional deal email.
Rules:
- Lead with the deal hook (price → value/bonus).
${lengthRule(platform)}
- Friendly, urgent promotional tone. No hashtags unless natural (max 2).
- Do NOT invent URLs, promo codes, or deadlines not in the input.
- Do NOT use markdown. Plain text only.${platformBlock}${styleRulesBlock(style)}`;
}

function finishCopy(raw: string, platform?: SocialPlatformId): string {
  const cleaned = sanitizeVoicePostCopy(raw);
  return platform ? truncateForPlatform(cleaned, platform) : cleaned;
}

export async function generateSocialPostCopy(opts: GenerateSocialPostOpts): Promise<string> {
  const contentOnly = !opts.deal;
  const style: VoiceStylePromptOpts = {
    brandName: opts.brandName,
    brandMentionLevel: opts.brandMentionLevel,
    contentProviderName: opts.contentProviderName,
    sourcesInPostsLevel: opts.sourcesInPostsLevel,
    preferredPhrases: opts.preferredPhrases,
  };

  if (!env.openaiApiKey) {
    let copy: string;
    if (contentOnly) {
      copy = `${opts.title}${opts.summary ? `\n\n${opts.summary}` : ""}`.trim();
    } else {
      const dealLine = formatDealLine(opts.deal!);
      copy = `${opts.title}\n\n${dealLine}${opts.summary ? `\n\n${opts.summary}` : ""}`.trim();
    }
    return finishCopy(copy, opts.platform);
  }

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const dealLine = opts.deal ? formatDealLine(opts.deal) : null;
  const userParts = [
    `Email subject: ${opts.title}`,
    opts.senderFrom ? `From: ${opts.senderFrom}` : null,
    opts.contentProviderName?.trim() && (opts.sourcesInPostsLevel ?? 0) > 0
      ? `Content provider: ${opts.contentProviderName.trim()}`
      : null,
    opts.signalName ? `Content signal: ${opts.signalName}` : null,
    dealLine ? `Deal tier: ${dealLine}` : null,
    opts.summary ? `Summary: ${opts.summary}` : null,
    opts.dealUrl?.trim()
      ? `Email deal link (use when a URL fits; do not invent other URLs): ${opts.dealUrl.trim()}`
      : null,
    opts.preferredPhrases?.length
      ? formatPreferredPhrasesForUserMessage(opts.preferredPhrases)
      : null,
    opts.platform ? `Publish to: ${getSocialPlatform(opts.platform).label}` : null,
  ].filter(Boolean);

  const systemPrompt = opts.constraints
    ? buildConstraintSystemPrompt(opts.constraints, contentOnly, style, opts.platform)
    : buildDefaultSystemPrompt(contentOnly, style, opts.platform, opts.persona);

  const res = await client.chat.completions.create({
    model: env.openaiModel,
    max_tokens: env.maxTokensSocialPost,
    temperature: opts.constraints?.sharedIdentity ? 0.3 : opts.constraints ? 0.35 : 0.5,
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
  return finishCopy(raw, opts.platform);
}

export async function generateSocialCopiesForPlatforms(
  platforms: SocialPlatformId[],
  baseOpts: Omit<GenerateSocialPostOpts, "platform">,
): Promise<Partial<Record<SocialPlatformId, string>>> {
  const out: Partial<Record<SocialPlatformId, string>> = {};
  for (const platform of platforms) {
    out[platform] = await generateSocialPostCopy({ ...baseOpts, platform });
  }
  return out;
}

export function resolveDistributionPlatforms(
  platforms: SocialPlatformId[] | undefined,
): SocialPlatformId[] {
  return platforms?.length ? platforms : ["twitter"];
}

export { formatDealLine };
