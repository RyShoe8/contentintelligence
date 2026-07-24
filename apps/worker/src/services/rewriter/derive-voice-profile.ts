import type { Db } from "mongodb";
import {
  deriveComposeVoiceProfile,
  emptyComposeVoiceProfile,
  listWriterStyleExamplesForVoice,
  writerArticleHtmlForLearning,
  type ComposeVoiceProfile,
  type Voice,
} from "@content-resourcer/db";

const MAX_PROFILE_SAMPLES = 5;

/**
 * Measure a voice's compose profile from its own style examples.
 *
 * Called during persona generation so the profile is refreshed whenever style examples change.
 * Returns an empty (brand-neutral) profile when the voice has no usable examples yet, rather
 * than falling back to another brand's characteristics.
 */
export async function deriveVoiceComposeProfile(
  db: Db,
  voice: Voice,
): Promise<ComposeVoiceProfile> {
  const articles = await listWriterStyleExamplesForVoice(db, voice.organization_id, voice.id);
  const htmlDocs = articles
    .slice(0, MAX_PROFILE_SAMPLES)
    .map((a) => writerArticleHtmlForLearning(a) ?? "")
    .filter((h) => h.trim().length > 0);

  if (!htmlDocs.length) return emptyComposeVoiceProfile();
  return deriveComposeVoiceProfile(htmlDocs);
}
