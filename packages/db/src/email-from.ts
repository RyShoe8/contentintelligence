export type ParsedEmailFrom = {
  displayName: string | null;
  email: string | null;
};

const GENERIC_DISPLAY_RE = /^(noreply|no-reply|donotreply|do-not-reply|marketing|support|info|hello|newsletter)$/i;

/** Parse RFC5322-style From: "Name" <email@host> or email@host */
export function parseEmailFrom(from: string): ParsedEmailFrom {
  const trimmed = from.trim();
  if (!trimmed) return { displayName: null, email: null };

  const angle = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (angle) {
    const displayName = angle[1]!.replace(/^["']|["']$/g, "").trim() || null;
    const email = angle[2]!.trim().toLowerCase() || null;
    return { displayName, email };
  }

  const emailOnly = trimmed.match(/^[\w.+-]+@[\w.-]+\.\w+$/i);
  if (emailOnly) {
    return { displayName: null, email: trimmed.toLowerCase() };
  }

  return { displayName: trimmed, email: null };
}

function isUsableBrandDisplayName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 2) return false;
  if (/^[\w.+-]+@[\w.-]+\.\w+$/i.test(n)) return false;
  if (GENERIC_DISPLAY_RE.test(n)) return false;
  return true;
}

function titleCaseWord(w: string): string {
  if (!w) return "";
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Derive a readable brand from email domain, e.g. zulacasino.com → Zula Casino */
export function casinoNameFromDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  let host = email.slice(at + 1).toLowerCase();
  host = host.replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return null;

  const base = parts.length >= 3 ? parts[parts.length - 2]! : parts[0]!;
  if (!base || base.length < 2) return null;

  let label = base;
  if (label.endsWith("casino") && label.length > 6) {
    const stem = label.slice(0, -6);
    label = stem ? `${titleCaseWord(stem)} Casino` : "Casino";
  } else if (host.includes("casino")) {
    label = `${titleCaseWord(label)} Casino`;
  } else {
    label = titleCaseWord(label);
  }

  return label.length >= 2 ? label.slice(0, 120) : null;
}

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Best-effort casino / brand name from From header, subject, or deal URL host.
 */
export function extractCasinoName(
  from: string,
  subject?: string,
  dealUrl?: string | null,
): string | null {
  const parsed = parseEmailFrom(from);

  if (parsed.displayName && isUsableBrandDisplayName(parsed.displayName)) {
    return parsed.displayName.slice(0, 120);
  }

  const fromDomain = casinoNameFromDomain(parsed.email);
  if (fromDomain) return fromDomain;

  const dealHost = hostFromUrl(dealUrl);
  if (dealHost && parsed.email) {
    const emailHost = parsed.email.slice(parsed.email.indexOf("@") + 1).replace(/^www\./, "");
    if (dealHost === emailHost || dealHost.endsWith(`.${emailHost}`) || emailHost.endsWith(`.${dealHost}`)) {
      const fromDeal = casinoNameFromDomain(`x@${dealHost}`);
      if (fromDeal) return fromDeal;
    }
  }

  if (subject?.trim()) {
    const m = subject.match(/\b([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)\s+Casino\b/);
    if (m?.[1]) {
      return `${m[1]} Casino`.slice(0, 120);
    }
  }

  return null;
}
