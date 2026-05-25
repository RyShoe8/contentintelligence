import type { BrandProfile } from "@content-resourcer/db";
import { env } from "../../env.js";
import { completeJson } from "../llm/json-completion.js";

export type CoreBrandAnalysis = Pick<
  BrandProfile,
  | "positioning"
  | "audienceRelationship"
  | "emotionalBaseline"
  | "taboos"
  | "contentObjectives"
  | "contradictions"
  | "contrastive"
  | "memory"
>;

type BatchedAnalysisJson = {
  positioning?: { primary?: string; secondary?: string };
  audienceRelationship?: { style?: string };
  emotionalBaseline?: { primary?: string; secondary?: string };
  taboos?: string[];
  contentObjectives?: string[];
  contradictions?: { primaryTrait?: string; secondaryTrait?: string };
  contrastive?: { soundsLike?: string[]; doesNotSoundLike?: string[] };
  memory?: {
    favoritePhrases?: string[];
    recurringTopics?: string[];
    recurringJokes?: string[];
    recurringCTAs?: string[];
    recurringEnemies?: string[];
  };
};

export async function extractCoreBrandAnalysis(opts: {
  voiceName: string;
  keywords: string[];
  corpusPrompt: string;
}): Promise<CoreBrandAnalysis | null> {
  const user = [
    `Brand name: ${opts.voiceName}`,
    opts.keywords.length ? `Keywords: ${opts.keywords.join(", ")}` : null,
    "",
    "Weighted content corpus (higher weight = more important):",
    opts.corpusPrompt || "(minimal corpus)",
  ]
    .filter((x) => x != null)
    .join("\n");

  const parsed = await completeJson<BatchedAnalysisJson>({
    system: `You analyze brand content to build a structured behavioral brand profile for social post generation.
Return JSON only with these keys:
- positioning: { primary, secondary? }
- audienceRelationship: { style }
- emotionalBaseline: { primary, secondary? }
- taboos: string[] (phrases/styles to avoid)
- contentObjectives: string[] (e.g. engagement, authority, conversion)
- contradictions: { primaryTrait, secondaryTrait } (productive tension between traits)
- contrastive: { soundsLike: string[], doesNotSoundLike: string[] }
- memory: { favoritePhrases, recurringTopics, recurringJokes, recurringCTAs, recurringEnemies }

Infer from the corpus. Be specific to this brand, not generic marketing advice.`,
    user,
    maxTokens: env.maxTokensBrandAnalyze,
  });

  if (!parsed) return null;

  return {
    positioning: {
      primary: parsed.positioning?.primary?.trim() ?? "",
      secondary: parsed.positioning?.secondary?.trim() || undefined,
    },
    audienceRelationship: {
      style: parsed.audienceRelationship?.style?.trim() ?? "",
    },
    emotionalBaseline: {
      primary: parsed.emotionalBaseline?.primary?.trim() ?? "",
      secondary: parsed.emotionalBaseline?.secondary?.trim() || undefined,
    },
    taboos: (parsed.taboos ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 15),
    contentObjectives: (parsed.contentObjectives ?? [])
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 10),
    contradictions: {
      primaryTrait: parsed.contradictions?.primaryTrait?.trim() ?? "",
      secondaryTrait: parsed.contradictions?.secondaryTrait?.trim() ?? "",
    },
    contrastive: {
      soundsLike: (parsed.contrastive?.soundsLike ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 10),
      doesNotSoundLike: (parsed.contrastive?.doesNotSoundLike ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 10),
    },
    memory: {
      favoritePhrases: (parsed.memory?.favoritePhrases ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 20),
      recurringTopics: (parsed.memory?.recurringTopics ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 20),
      recurringJokes: (parsed.memory?.recurringJokes ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 20),
      recurringCTAs: (parsed.memory?.recurringCTAs ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 20),
      recurringEnemies: (parsed.memory?.recurringEnemies ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 20),
    },
  };
}

export function fallbackCoreBrandAnalysis(voiceName: string, keywords: string[]): CoreBrandAnalysis {
  const kw = keywords.join(", ") || "promotional";
  return {
    positioning: { primary: `${voiceName} brand voice`, secondary: kw },
    audienceRelationship: { style: "trusted advisor" },
    emotionalBaseline: { primary: "confident urgency" },
    taboos: [
      "avoid generic AI phrasing",
      "avoid corporate jargon",
      "avoid exaggerated hype",
      "no emojis",
      "no em dash or en dash punctuation (use commas or periods instead)",
    ],
    contentObjectives: ["engagement", "conversion"],
    contradictions: { primaryTrait: "analytical", secondaryTrait: "accessible" },
    contrastive: {
      soundsLike: ["savvy insider"],
      doesNotSoundLike: ["generic casino affiliate", "corporate marketer"],
    },
    memory: {
      favoritePhrases: [],
      recurringTopics: keywords.slice(0, 5),
      recurringJokes: [],
      recurringCTAs: [],
      recurringEnemies: [],
    },
  };
}
