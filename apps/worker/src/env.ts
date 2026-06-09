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
  maxTokensWriter: num("MAX_TOKENS_WRITER", 8192),
  maxTokensWriterResearchPlan: num("MAX_TOKENS_WRITER_RESEARCH_PLAN", 800),
  maxTokensWriterResearchSection: num("MAX_TOKENS_WRITER_RESEARCH_SECTION", 2000),
  maxWriterInputChars: num("MAX_WRITER_INPUT_CHARS", 48000),
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  writerWebSearchMaxResults: num("WRITER_WEB_SEARCH_MAX_RESULTS", 10),
  writerWebSearchMaxQueries: num("WRITER_WEB_SEARCH_MAX_QUERIES", 6),
  maxTokensBrandAnalyze: num("MAX_TOKENS_BRAND_ANALYZE", 1200),
  maxTokensVisualAnalyze: num("MAX_TOKENS_VISUAL_ANALYZE", 900),
  maxTokensImagePrompt: num("MAX_TOKENS_IMAGE_PROMPT", 400),
  /** Default gpt-image-1; set dall-e-2/3 explicitly if your API key still supports DALL·E. */
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
  postImageMaxB64: num("POST_IMAGE_MAX_B64", 400_000),
  postImageMaxDownloadBytes: num("POST_IMAGE_MAX_DOWNLOAD_BYTES", 6_000_000),
  postImageJpegQuality: num("POST_IMAGE_JPEG_QUALITY", 75),
  postImageMaxDimension: num("POST_IMAGE_MAX_DIMENSION", 1024),
  brandCorpusMaxChars: num("BRAND_CORPUS_MAX_CHARS", 24000),
  brandMemoryMaxItems: num("BRAND_MEMORY_MAX_ITEMS", 20),
  brandProfileForceRebuild: bool("BRAND_PROFILE_FORCE_REBUILD", false),
  voiceRssMaxArticles: num("VOICE_RSS_MAX_ARTICLES", 15),
  voiceRssArticleMaxChars: num("VOICE_RSS_ARTICLE_MAX_CHARS", 50_000),
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
