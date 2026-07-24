import type { Db } from "mongodb";
import {
  brandProfileSchema,
  type BrandProfile,
  type ComposeVoiceProfile,
  type Voice,
} from "@content-resourcer/db";
import { env } from "../env.js";
import {
  extractCoreBrandAnalysis,
  fallbackCoreBrandAnalysis,
} from "../services/brand-dna/extract-brand-dna.js";
import {
  extractRhetoricalPatterns,
  fallbackRhetoricalPatterns,
} from "../services/behavior-analysis/extract-rhetorical-patterns.js";
import {
  behaviorCorpusText,
  buildBrandContentCorpus,
} from "../services/corpus/build-brand-content-corpus.js";
import { synthesizeSharedIdentity } from "../services/brand-dna/synthesize-shared-identity.js";
import { extractContradictions } from "../services/contradictions/extract-contradictions.js";
import { extractVisualCorpusHints } from "../services/corpus/extract-visual-corpus-hints.js";
import { deriveWriterPersonaSummary } from "../services/derive-persona-summary.js";
import { buildComposeEditorialPersonaBlock } from "../services/rewriter/compose-editorial-persona.js";
import { deriveVoiceComposeProfile } from "../services/rewriter/derive-voice-profile.js";
import {
  extractVisualPersonality,
  fallbackVisualPersonality,
} from "../services/visual-analysis/extract-visual-personality.js";
import { mergeTaboosWithGlobal } from "../voice-style-rules.js";

export type AnalyzeBrandProfileResult = {
  profile: BrandProfile;
  persona: string;
  corpusHash: string;
  cached: boolean;
  /** Voice characteristics measured from this brand's own style examples. */
  composeVoiceProfile: ComposeVoiceProfile;
};

async function buildStoredWriterPersona(
  db: Db,
  profile: BrandProfile,
  voice: Voice,
): Promise<string> {
  const composeEditorialBlock = await buildComposeEditorialPersonaBlock(db, voice);
  return deriveWriterPersonaSummary(profile, voice.name, composeEditorialBlock);
}

export async function analyzeBrandProfile(
  db: Db,
  voice: Voice,
  options?: { forceRebuild?: boolean },
): Promise<AnalyzeBrandProfileResult> {
  const corpus = await buildBrandContentCorpus(db, voice);
  const hash = corpus.hash;

  const canUseCache =
    !options?.forceRebuild &&
    !env.brandProfileForceRebuild &&
    voice.brand_profile &&
    voice.corpus_hash === hash &&
    voice.persona_status === "ready";

  if (canUseCache && voice.brand_profile) {
    return {
      profile: voice.brand_profile,
      persona: await buildStoredWriterPersona(db, voice.brand_profile, voice),
      corpusHash: hash,
      cached: true,
      // Re-measured even on the cached path: style examples can change without the brand
      // corpus hash changing, and a stale voice profile silently mis-describes the brand.
      composeVoiceProfile: await deriveVoiceComposeProfile(db, voice),
    };
  }

  const core =
    (await extractCoreBrandAnalysis({
      voiceName: voice.name,
      keywords: voice.keywords,
      corpusPrompt: corpus.promptText,
    })) ?? fallbackCoreBrandAnalysis(voice.name, voice.keywords);

  const patterns = await extractRhetoricalPatterns(behaviorCorpusText(corpus.chunks));
  const rhetoricalPatterns = patterns.length ? patterns : fallbackRhetoricalPatterns();

  const contradictions = extractContradictions({
    contradictions: core.contradictions,
    positioning: core.positioning,
    emotionalBaseline: core.emotionalBaseline,
  });

  const copySummary = [
    core.positioning.primary,
    core.audienceRelationship.style,
    core.emotionalBaseline.primary,
    core.contrastive.soundsLike.join("; "),
  ]
    .filter(Boolean)
    .join(" · ");

  const visualHints = await extractVisualCorpusHints(voice);
  const { visual, confidence: visualConfidence } = await extractVisualPersonality({
    voiceName: voice.name,
    keywords: voice.keywords,
    visualHints: visualHints.promptBlock,
    copySummary,
  });

  const visualForShared =
    visual.visualTone || visualHints.hasSignals ? visual : fallbackVisualPersonality(voice.name);

  const { shared, archetype } = await synthesizeSharedIdentity({
    voiceName: voice.name,
    keywords: voice.keywords,
    core,
    visual: visualForShared,
  });

  const previousMemory = voice.brand_profile?.memory;
  const profile = brandProfileSchema.parse({
    positioning: core.positioning,
    audienceRelationship: core.audienceRelationship,
    emotionalBaseline: core.emotionalBaseline,
    taboos: mergeTaboosWithGlobal(core.taboos),
    rhetoricalPatterns,
    contentObjectives: core.contentObjectives,
    contradictions,
    contrastive: core.contrastive,
    memory: {
      ...core.memory,
      favoritePhrases: mergeMemoryLists(
        previousMemory?.favoritePhrases,
        core.memory.favoritePhrases,
      ),
      recurringTopics: mergeMemoryLists(
        previousMemory?.recurringTopics,
        core.memory.recurringTopics,
      ),
      recurringJokes: mergeMemoryLists(previousMemory?.recurringJokes, core.memory.recurringJokes),
      recurringCTAs: mergeMemoryLists(previousMemory?.recurringCTAs, core.memory.recurringCTAs),
      recurringEnemies: mergeMemoryLists(
        previousMemory?.recurringEnemies,
        core.memory.recurringEnemies,
      ),
    },
    archetype,
    visualPersonality: visualForShared,
    sharedIdentity: shared,
    confidence: corpus.promptText.length > 500 ? 0.75 : 0.45,
    visualConfidence,
    analyzedAt: new Date(),
    corpusHash: hash,
  });

  const persona = await buildStoredWriterPersona(db, profile, voice);
  const composeVoiceProfile = await deriveVoiceComposeProfile(db, voice);

  return { profile, persona, corpusHash: hash, cached: false, composeVoiceProfile };
}

function mergeMemoryLists(existing: string[] | undefined, incoming: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const max = env.brandMemoryMaxItems;
  for (const x of [...(existing ?? []), ...incoming]) {
    const s = x.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
