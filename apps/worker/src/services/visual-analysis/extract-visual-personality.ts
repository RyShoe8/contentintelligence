import {
  emptyVisualPersonality,
  visualPersonalitySchema,
  type VisualPersonality,
} from "@content-resourcer/db";
import { env } from "../../env.js";
import { coerceLlmString } from "../llm/coerce-llm-field.js";
import { completeJson } from "../llm/json-completion.js";

type VisualJson = {
  visualTone?: string | string[];
  compositionStyle?: string[];
  colorProfile?: {
    dominantColors?: string[];
    contrastLevel?: string | string[];
    saturationLevel?: string | string[];
    lightingMood?: string | string[];
  };
  textureStyle?: string[];
  typographyStyle?: string | string[];
  layoutBehavior?: string[];
  memeCompatibility?: string | string[];
  visualTaboos?: string[];
  visualArchetypes?: string[];
  recurringMotifs?: string[];
};

export function fallbackVisualPersonality(voiceName: string): VisualPersonality {
  return visualPersonalitySchema.parse({
    visualTone: `${voiceName} promotional brand aesthetic`,
    compositionStyle: ["clean typography", "centered focal point"],
    colorProfile: {
      dominantColors: [],
      contrastLevel: "medium",
      saturationLevel: "moderate",
      lightingMood: "neutral",
    },
    textureStyle: ["modern digital"],
    typographyStyle: "modern sans-serif",
    layoutBehavior: ["balanced layout"],
    memeCompatibility: "low — keep imagery professional",
    visualTaboos: [
      "avoid stock-photo gambling clichés",
      "avoid random AI gloss",
      "avoid Vegas jackpot aesthetics",
    ],
    visualArchetypes: ["promotional brand"],
    recurringMotifs: [],
  });
}

export async function extractVisualPersonality(opts: {
  voiceName: string;
  keywords: string[];
  visualHints: string;
  copySummary: string;
}): Promise<{ visual: VisualPersonality; confidence: number }> {
  if (!opts.visualHints.trim() && !opts.copySummary.trim()) {
    return { visual: fallbackVisualPersonality(opts.voiceName), confidence: 0.35 };
  }

  const user = [
    `Brand: ${opts.voiceName}`,
    opts.keywords.length ? `Keywords: ${opts.keywords.join(", ")}` : null,
    "",
    "Copy personality summary:",
    opts.copySummary || "(minimal)",
    "",
    "Visual corpus hints (HTML/CSS/meta):",
    opts.visualHints || "(minimal)",
  ]
    .filter((x) => x != null)
    .join("\n");

  const parsed = await completeJson<VisualJson>({
    system: `Infer how this brand would visually present itself on social — NOT generic "nice" imagery.
Return JSON only with: visualTone, compositionStyle[], colorProfile { dominantColors, contrastLevel, saturationLevel, lightingMood },
textureStyle[], typographyStyle, layoutBehavior[], memeCompatibility, visualTaboos[], visualArchetypes[], recurringMotifs[].
Be specific to this brand's niche and culture.`,
    user,
    maxTokens: env.maxTokensVisualAnalyze,
  });

  if (!parsed) {
    return { visual: fallbackVisualPersonality(opts.voiceName), confidence: 0.4 };
  }

  const visual = visualPersonalitySchema.parse({
    visualTone: coerceLlmString(parsed.visualTone),
    compositionStyle: (parsed.compositionStyle ?? []).map((s) => String(s).trim()).filter(Boolean),
    colorProfile: {
      dominantColors: (parsed.colorProfile?.dominantColors ?? [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 8),
      contrastLevel: coerceLlmString(parsed.colorProfile?.contrastLevel),
      saturationLevel: coerceLlmString(parsed.colorProfile?.saturationLevel),
      lightingMood: coerceLlmString(parsed.colorProfile?.lightingMood),
    },
    textureStyle: (parsed.textureStyle ?? []).map((s) => String(s).trim()).filter(Boolean),
    typographyStyle: coerceLlmString(parsed.typographyStyle),
    layoutBehavior: (parsed.layoutBehavior ?? []).map((s) => String(s).trim()).filter(Boolean),
    memeCompatibility: coerceLlmString(parsed.memeCompatibility),
    visualTaboos: (parsed.visualTaboos ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 15),
    visualArchetypes: (parsed.visualArchetypes ?? []).map((s) => String(s).trim()).filter(Boolean),
    recurringMotifs: (parsed.recurringMotifs ?? []).map((s) => String(s).trim()).filter(Boolean),
  });

  const filled =
    Boolean(visual.visualTone) &&
    (visual.compositionStyle.length > 0 || visual.colorProfile.dominantColors.length > 0);

  return { visual, confidence: filled ? 0.72 : 0.5 };
}
