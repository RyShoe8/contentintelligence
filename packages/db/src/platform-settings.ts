import { z } from "zod";

/**
 * Platform-wide model + generation settings.
 *
 * Historically the OpenAI model was env-only (`OPENAI_MODEL` on the worker), which meant
 * every LLM call in the system — research, fact extraction, prose generation, scoring —
 * shared one model and could only be changed by a redeploy. These settings split model
 * choice by task tier and move it into the database so it is editable from /admin/settings.
 */

export const PLATFORM_SETTINGS_ID = "platform";

export type ModelTier = "writer" | "utility" | "research";

export type OpenAiModelOption = {
  id: string;
  label: string;
  /** Tiers this model is a sensible choice for. */
  tiers: ModelTier[];
  description: string;
};

/**
 * Selectable OpenAI chat models.
 *
 * Kept as a plain list (not an enum) so an operator can still set a model via env that is
 * newer than this catalog without the Zod parse rejecting the stored document.
 */
export const OPENAI_MODEL_CATALOG: OpenAiModelOption[] = [
  {
    id: "gpt-5",
    label: "GPT-5",
    tiers: ["writer", "research"],
    description: "Strongest prose and voice retention. Best choice for the writer tier.",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    tiers: ["writer", "utility", "research"],
    description: "Fast and cheap with better prose than the 4o-mini generation.",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    tiers: ["writer", "research"],
    description: "Strong long-form writing and instruction following.",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    tiers: ["utility", "research"],
    description: "Good extraction and scoring model at low cost.",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    tiers: ["writer", "research"],
    description: "Solid general writer. Reliable but less distinctive than GPT-5 or 4.1.",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    tiers: ["utility"],
    description:
      "Cheapest option. Strong pull toward generic blog voice — not recommended for the writer tier.",
  },
];

/** Models we actively steer operators away from for prose generation. */
export const WEAK_PROSE_MODEL_IDS = new Set(["gpt-4o-mini", "gpt-3.5-turbo"]);

export const DEFAULT_WRITER_MODEL = "gpt-4.1";
export const DEFAULT_UTILITY_MODEL = "gpt-4o-mini";
export const DEFAULT_RESEARCH_MODEL = "gpt-4.1-mini";

/**
 * Number of whole-article rewrite passes the compose pipeline is allowed after the first
 * draft. Each pass regresses prose toward the model's mean, so this is a voice-quality knob,
 * not just a cost knob.
 */
export const COMPOSE_REWRITE_PASSES_DEFAULT = 2;
export const COMPOSE_REWRITE_PASSES_MAX = 8;

/** Minimum voice-fidelity score (0-100) before compose flags a voice warning. */
export const VOICE_FIDELITY_MIN_DEFAULT = 55;

function modelId(fallback: string) {
  return z.preprocess(
    (v) => (v == null || v === "" ? fallback : String(v).trim()),
    z.string().min(1).max(100).default(fallback),
  );
}

export const platformSettingsSchema = z.object({
  id: z.literal(PLATFORM_SETTINGS_ID).default(PLATFORM_SETTINGS_ID),
  /** Prose generation: reconstruction, humanizing, style transfer, expansion. */
  writer_model: modelId(DEFAULT_WRITER_MODEL),
  /** Structured work: fact extraction, JSON scoring, ranking, critique. */
  utility_model: modelId(DEFAULT_UTILITY_MODEL),
  /** Research briefs and topic planning. */
  research_model: modelId(DEFAULT_RESEARCH_MODEL),
  compose_rewrite_passes: z.preprocess(
    (v) => (v == null || v === "" ? COMPOSE_REWRITE_PASSES_DEFAULT : v),
    z.coerce
      .number()
      .int()
      .min(0)
      .max(COMPOSE_REWRITE_PASSES_MAX)
      .default(COMPOSE_REWRITE_PASSES_DEFAULT),
  ),
  voice_fidelity_min: z.preprocess(
    (v) => (v == null || v === "" ? VOICE_FIDELITY_MIN_DEFAULT : v),
    z.coerce.number().int().min(0).max(100).default(VOICE_FIDELITY_MIN_DEFAULT),
  ),
  updated_by: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().max(320).optional(),
  ),
  updated_at: z.coerce.date().default(() => new Date()),
});

export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export type ModelSelection = {
  writer: string;
  utility: string;
  research: string;
};

export function defaultPlatformSettings(): PlatformSettings {
  return platformSettingsSchema.parse({ id: PLATFORM_SETTINGS_ID });
}

export function modelSelectionFromSettings(settings: PlatformSettings): ModelSelection {
  return {
    writer: settings.writer_model,
    utility: settings.utility_model,
    research: settings.research_model,
  };
}

export function modelOptionsForTier(tier: ModelTier): OpenAiModelOption[] {
  return OPENAI_MODEL_CATALOG.filter((m) => m.tiers.includes(tier));
}

export function findModelOption(id: string): OpenAiModelOption | undefined {
  const trimmed = id.trim();
  return OPENAI_MODEL_CATALOG.find((m) => m.id === trimmed);
}

/** Warning text when a weak-prose model is selected for the writer tier. */
export function writerModelWarning(modelIdValue: string): string | undefined {
  if (!WEAK_PROSE_MODEL_IDS.has(modelIdValue.trim())) return undefined;
  return `${modelIdValue} is a cost-optimised model with a strong pull toward generic blog voice. Articles will read flat regardless of voice settings.`;
}

export const platformSettingsUpdateSchema = platformSettingsSchema
  .pick({
    writer_model: true,
    utility_model: true,
    research_model: true,
    compose_rewrite_passes: true,
    voice_fidelity_min: true,
  })
  .partial();

export type PlatformSettingsUpdate = z.infer<typeof platformSettingsUpdateSchema>;
