import "dotenv/config";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
  /** Minimum lookback window (hours) when using gap since last ingest (avoids zero-width double-sync). */
  ingestMinGapHours: num("INGEST_MIN_GAP_HOURS", 5 / 60),
};
