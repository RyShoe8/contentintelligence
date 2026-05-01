/** Tooltip copy for Gmail input signal fields (matches worker ingest behavior). */
export const SIGNAL_FIELD_TIPS = {
  vertical_id:
    "Which vertical this rule belongs to. That vertical’s default keywords are merged with signal keywords for the post-fetch keyword check.",
  name: "A label for you in the UI only; it is not sent to Gmail.",
  email_address:
    "The Gmail address for this rule. It must match the account you authorized with OAuth on the Render worker (tokens are stored per inbox).",
  labels:
    "Optional Gmail label names, one per line. Narrows the Gmail search with label: filters (several lines are OR’d). Spelling and spaces must match Gmail.",
  sender_addresses:
    "Optional, one per line. Added as from: in the Gmail search (OR’d). After messages are fetched, the From header must match one of these (substring) or a sender domain below. Leave both sender lists empty to allow any sender.",
  sender_domains:
    "Optional domains such as casino.com (one per line, @ optional). Used in the Gmail from: search and to match the sender’s email domain after fetch.",
  subject_keywords:
    "Optional, one per line. Each becomes a Gmail subject: term; multiple lines are OR’d in the search query.",
  keywords:
    "Comma or newline. Merged with this vertical’s default keywords. After fetch, the message subject plus body text must contain at least one of those keywords (case-insensitive). If the merged list is empty, this check is skipped.",
  lookback_window_hours:
    "How far back the Gmail search goes (after: date = now minus this many hours). Default 168 is one week; max 2160 is 90 days.",
  scan_body:
    "When on, more of the email body is converted to text for scoring and summaries. When off, only about the first five lines of extracted body text are used.",
  enabled: "When off, the worker skips this signal entirely during ingestion.",
} as const;

export type SignalFieldTipKey = keyof typeof SIGNAL_FIELD_TIPS;
