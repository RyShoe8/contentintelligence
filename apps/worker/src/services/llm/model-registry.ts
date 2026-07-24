import type { Db } from "mongodb";
import {
  getPlatformSettings,
  modelSelectionFromSettings,
  COMPOSE_REWRITE_PASSES_DEFAULT,
  VOICE_FIDELITY_MIN_DEFAULT,
  type ModelSelection,
  type PlatformSettings,
} from "@content-resourcer/db";
import { env } from "../../env.js";

/**
 * Process-local cache of platform model settings.
 *
 * Most LLM call sites (humanizer, reconstruction, style transfer, json-completion) do not
 * have a Db handle, and threading one through every prompt builder would be invasive. Instead
 * the worker primes this registry at startup and before each compose job, and the call sites
 * read it synchronously.
 */

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  selection: ModelSelection;
  composeRewritePasses: number;
  voiceFidelityMin: number;
  loadedAt: number;
};

let cache: CacheEntry | null = null;
let inFlight: Promise<void> | null = null;

/**
 * Fallback when the database has no saved settings.
 *
 * `OPENAI_MODEL` stays honoured so existing deploys do not change behaviour on upgrade, but it
 * only seeds the utility tier — the writer tier falls back to the stronger prose default rather
 * than inheriting a cost-optimised env value.
 */
function envFallback(): CacheEntry {
  const envModel = env.openaiModel.trim();
  return {
    selection: {
      writer: env.openaiWriterModel.trim() || envModel,
      utility: envModel,
      research: env.openaiResearchModel.trim() || envModel,
    },
    composeRewritePasses: COMPOSE_REWRITE_PASSES_DEFAULT,
    voiceFidelityMin: VOICE_FIDELITY_MIN_DEFAULT,
    loadedAt: 0,
  };
}

function entryFromSettings(settings: PlatformSettings): CacheEntry {
  return {
    selection: modelSelectionFromSettings(settings),
    composeRewritePasses: settings.compose_rewrite_passes,
    voiceFidelityMin: settings.voice_fidelity_min,
    loadedAt: Date.now(),
  };
}

function isFresh(entry: CacheEntry | null): entry is CacheEntry {
  return entry != null && Date.now() - entry.loadedAt < CACHE_TTL_MS;
}

/** Load platform settings into the registry. Safe to call often — deduped and TTL-cached. */
export async function refreshModelSettings(db: Db, opts?: { force?: boolean }): Promise<void> {
  if (!opts?.force && isFresh(cache)) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const settings = await getPlatformSettings(db);
      cache = entryFromSettings(settings);
    } catch {
      // Keep serving the previous value (or env fallback) if Mongo is briefly unavailable.
      if (!cache) cache = envFallback();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function current(): CacheEntry {
  return cache ?? envFallback();
}

/** Prose generation: reconstruction, humanizing, style transfer, expansion. */
export function writerModel(): string {
  return current().selection.writer;
}

/** Structured work: fact extraction, JSON scoring, ranking, critique. */
export function utilityModel(): string {
  return current().selection.utility;
}

/** Research briefs and topic planning. */
export function researchModel(): string {
  return current().selection.research;
}

/** Whole-article rewrite passes allowed after the first draft. */
export function composeRewritePassBudget(): number {
  return current().composeRewritePasses;
}

/** Minimum voice-fidelity score before compose raises a warning. */
export function voiceFidelityMin(): number {
  return current().voiceFidelityMin;
}

export function modelSelection(): ModelSelection {
  return { ...current().selection };
}

/** Test hook. */
export function __setModelRegistryForTests(entry: Partial<CacheEntry> | null): void {
  if (entry == null) {
    cache = null;
    return;
  }
  const base = envFallback();
  cache = {
    selection: entry.selection ?? base.selection,
    composeRewritePasses: entry.composeRewritePasses ?? base.composeRewritePasses,
    voiceFidelityMin: entry.voiceFidelityMin ?? base.voiceFidelityMin,
    loadedAt: entry.loadedAt ?? Date.now(),
  };
}
