import type { BrandProfile } from "@content-resourcer/db";

/** Contrastive profile is extracted in the batched core brand analysis. */
export function generateContrastiveProfile(
  profile: Pick<BrandProfile, "contrastive">,
): BrandProfile["contrastive"] {
  return profile.contrastive;
}
