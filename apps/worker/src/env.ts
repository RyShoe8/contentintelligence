import "dotenv/config";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const t = v.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(t)) return true;
  if (["0", "false", "no", "off"].includes(t)) return false;
  return fallback;
}

export const env = {
  port: num("PORT", 8787),
  mongodbUri: process.env.MONGODB_URI ?? "",
  gmailClientId: process.env.GMAIL_CLIENT_ID ?? "",
  gmailClientSecret: process.env.GMAIL_CLIENT_SECRET ?? "",
  gmailRedirectUri: process.env.GMAIL_REDIRECT_URI ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  ingestCron: process.env.INGEST_CRON ?? "*/15 * * * *",
  ingestSecret: process.env.INGEST_SECRET ?? "",
  minBodyChars: num("MIN_BODY_CHARS", 80),
  maxBodyChars: num("MAX_BODY_CHARS", 12000),
  maxAiInputChars: num("MAX_AI_INPUT_CHARS", 8000),
  maxTokensSummary: num("MAX_TOKENS_SUMMARY", 200),
  maxTokensDeal: num("MAX_TOKENS_DEAL", 250),
  maxTokensSocialPost: num("MAX_TOKENS_SOCIAL_POST", 300),
  maxTokensBrandAnalyze: num("MAX_TOKENS_BRAND_ANALYZE", 1200),
  maxTokensVisualAnalyze: num("MAX_TOKENS_VISUAL_ANALYZE", 900),
  maxTokensImagePrompt: num("MAX_TOKENS_IMAGE_PROMPT", 400),
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "dall-e-3",
  postImageMaxB64: num("POST_IMAGE_MAX_B64", 400_000),
  brandCorpusMaxChars: num("BRAND_CORPUS_MAX_CHARS", 24000),
  brandMemoryMaxItems: num("BRAND_MEMORY_MAX_ITEMS", 20),
  brandProfileForceRebuild: bool("BRAND_PROFILE_FORCE_REBUILD", false),
  signalScheduleCron: process.env.SIGNAL_SCHEDULE_CRON ?? "* * * * *",
  /** Minimum lookback window (hours) when using gap since last ingest (avoids zero-width double-sync). */
  ingestMinGapHours: num("INGEST_MIN_GAP_HOURS", 5 / 60),
  /** When true, ingest fetches hotlinked https img URLs (SSRF-guarded) into email_images. */
  emailImageFetchRemote: bool("EMAIL_IMAGE_FETCH_REMOTE", true),
  emailImageFetchTimeoutMs: num("EMAIL_IMAGE_FETCH_TIMEOUT_MS", 10_000),
  emailImageFetchMaxBytes: num("EMAIL_IMAGE_FETCH_MAX_BYTES", 500_000),
  /** Max images stored per signal item (attachments + inline + remote). */
  emailImageMaxCount: num("EMAIL_IMAGE_MAX_COUNT", 15),
  /** Max total base64 payload across all images (Mongo size guard). */
  emailImageMaxTotalB64: num("EMAIL_IMAGE_MAX_TOTAL_B64", 2_500_000),
  /** Max base64 length per single image. */
  emailImageMaxB64PerImage: num("EMAIL_IMAGE_MAX_B64_PER_IMAGE", 400_000),
};
