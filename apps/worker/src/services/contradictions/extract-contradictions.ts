import type { BrandProfile } from "@content-resourcer/db";

export function extractContradictions(
  profile: Pick<BrandProfile, "contradictions" | "positioning" | "emotionalBaseline">,
): BrandProfile["contradictions"] {
  if (profile.contradictions.primaryTrait && profile.contradictions.secondaryTrait) {
    return profile.contradictions;
  }

  const primary = profile.positioning.primary || profile.emotionalBaseline.primary || "analytical";
  const secondary =
    profile.contradictions.secondaryTrait ||
    profile.positioning.secondary ||
    profile.emotionalBaseline.primary ||
    "accessible";

  return {
    primaryTrait: primary,
    secondaryTrait: secondary,
  };
}
