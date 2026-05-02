import type { GmailInputConfig } from "@content-resourcer/db";

export type BuildGmailQueryOptions = {
  /** Overrides `config.lookback_window_hours` for the `after:` clause only (incremental ingest). */
  lookbackHours?: number;
};

/** Build Gmail `q` search string from signal config (AND of clauses). */
export function buildGmailQuery(config: GmailInputConfig, options?: BuildGmailQueryOptions): string {
  const parts: string[] = [];

  const hours = options?.lookbackHours ?? config.lookback_window_hours;
  const after = new Date(Date.now() - hours * 3600 * 1000);
  const y = after.getFullYear();
  const m = after.getMonth() + 1;
  const d = after.getDate();
  parts.push(`after:${y}/${m}/${d}`);

  if (config.labels?.length) {
    const labelParts = config.labels.map((label) => {
      const escaped = label.includes(" ") ? `"${label.replace(/"/g, "")}"` : label;
      return `label:${escaped}`;
    });
    parts.push(labelParts.length > 1 ? `(${labelParts.join(" OR ")})` : labelParts[0]!);
  }

  const fromClauses: string[] = [];
  for (const addr of config.sender_addresses ?? []) {
    if (addr.trim()) fromClauses.push(addr.trim());
  }
  for (const domain of config.sender_domains ?? []) {
    const d = domain.replace(/^@+/, "").trim();
    if (d) fromClauses.push(d);
  }
  if (fromClauses.length) {
    const inner = fromClauses.map((f) => `from:${f}`).join(" OR ");
    parts.push(fromClauses.length > 1 ? `(${inner})` : inner);
  }

  if (config.subject_keywords?.length) {
    const inner = config.subject_keywords
      .filter((k) => k.trim())
      .map((k) => `subject:${quoteIfNeeded(k.trim())}`)
      .join(" OR ");
    if (inner) parts.push(config.subject_keywords.length > 1 ? `(${inner})` : inner);
  }

  return parts.join(" ");
}

function quoteIfNeeded(s: string): string {
  if (/[\s()]/.test(s)) return `"${s.replace(/"/g, "")}"`;
  return s;
}
