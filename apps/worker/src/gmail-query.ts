import type { GmailSourceConfig } from "@content-resourcer/db";

export type BuildGmailQueryOptions = {
  lookbackHours?: number;
};

/** Build Gmail `q` search string from source config (AND of clauses). */
export function buildGmailQuery(config: GmailSourceConfig, options?: BuildGmailQueryOptions): string {
  const parts: string[] = [];

  const hours = options?.lookbackHours ?? 168;
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

  return parts.join(" ");
}
