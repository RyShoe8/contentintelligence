import type { BrandProfile, Post, VisualPersonality } from "@content-resourcer/db";

export type BuildImagePromptInput = {
  profile: BrandProfile;
  post: Pick<Post, "title" | "social_copy" | "deal_metrics">;
  platformCopy?: string;
};

function visualClause(visual: VisualPersonality): string[] {
  const parts: string[] = [];
  if (visual.visualTone) parts.push(visual.visualTone);
  if (visual.compositionStyle.length) {
    parts.push(visual.compositionStyle.join(", "));
  }
  if (visual.colorProfile.dominantColors.length) {
    parts.push(`palette: ${visual.colorProfile.dominantColors.join(", ")}`);
  }
  if (visual.colorProfile.lightingMood) {
    parts.push(`${visual.colorProfile.lightingMood} lighting`);
  }
  if (visual.textureStyle.length) parts.push(visual.textureStyle.join(", "));
  if (visual.typographyStyle) parts.push(`${visual.typographyStyle} typography`);
  if (visual.layoutBehavior.length) parts.push(visual.layoutBehavior.join(", "));
  if (visual.recurringMotifs.length) {
    parts.push(`motifs: ${visual.recurringMotifs.join(", ")}`);
  }
  return parts;
}

export function buildImagePrompt(input: BuildImagePromptInput): string {
  const { profile, post, platformCopy } = input;
  const visual = profile.visualPersonality;
  const shared = profile.sharedIdentity;

  const clauses: string[] = [
    "Social promo graphic, no text overlays, no logos, no watermarks.",
    ...visualClause(visual),
  ];

  if (profile.emotionalBaseline.primary) {
    clauses.push(`${profile.emotionalBaseline.primary} mood`);
  }
  if (shared.audienceType) clauses.push(`for ${shared.audienceType}`);
  if (shared.energyProfile) clauses.push(shared.energyProfile);
  if (shared.internetCultureAlignment) {
    clauses.push(shared.internetCultureAlignment);
  }
  if (profile.archetype) clauses.push(`${profile.archetype} brand archetype`);

  const subject = platformCopy?.trim() || post.social_copy?.trim() || post.title;
  if (subject) {
    clauses.push(`inspired by promo theme: ${subject.slice(0, 200)}`);
  }

  if (visual.visualTaboos.length) {
    clauses.push(`avoid: ${visual.visualTaboos.join("; ")}`);
  }

  return clauses.filter(Boolean).join(", ").slice(0, 3800);
}
