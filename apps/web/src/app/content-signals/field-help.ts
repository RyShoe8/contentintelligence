export const CONTENT_SIGNAL_FIELD_TIPS = {
  name: "A short label for this content signal (e.g. Gambling, Sports).",
  description: "Optional notes for your team.",
  keywords:
    "Comma or newline. After Gmail fetch, message subject + body must contain at least one keyword (case-insensitive). If empty, keyword check is skipped.",
  lookback_window_hours:
    "How far back to fetch mail and how long to keep items in the feed and database. Older rows are removed on sync and when you save this setting. After a successful ingest, the worker also uses the smaller of this value and time since last ingest for Gmail fetch.",
  deal_unit_tokens:
    "Comma or newline. Suffix labels for credited amounts (e.g. SC, FC, GC). Dollar amounts are parsed automatically; do not compare USD pay to SC credits in deal filters. If empty, ingest uses SC, FC, and GC for deal parsing. Does not change Gmail search.",
  active: "When off, ingest skips all sources attached to this content signal.",
} as const;

export const SOURCE_FIELD_TIPS = {
  labels:
    "Gmail label names, one per line. Narrows the Gmail search (OR across lines). Must match Gmail spelling.",
  sender_addresses:
    "Optional, one per line. Gmail from: filter and post-fetch From header match.",
  sender_domains:
    "Optional domains such as casino.com. Used in Gmail search and sender matching after fetch.",
  scan_body:
    "When on, more body text is used for scoring and summaries. When off, only ~5 lines of body.",
  ai_summary_enabled:
    "When off, OpenAI summary is skipped for this source; deal parsing still runs if configured.",
} as const;
