export type PickDealLinkContext = {
  html?: string;
  subject?: string;
  from?: string;
};

const DENY_URL_RE =
  /unsubscribe|preferences|privacy|terms|mailto:|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|linkedin\.com|google\.com\/maps|apps\.apple\.com|play\.google\.com/i;

const NON_DEAL_URL_RE =
  /w3\.org\/1999\/xhtml|w3\.org\/TR\/|w3\.org\/2000\/|schemas\.microsoft\.com|xmlns|\.dtd(?:\?|$)|fonts\.googleapis\.com|fonts\.gstatic\.com|\/css(?:\?|\/|$)|\.css(?:\?|$)/i;

const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i;

const EMAIL_ASSET_RE = /responsysimages|\/assets\/responsys|_Email_|_600W\.png/i;

const ESP_TRACKING_RE =
  /exponea\.com|responsys\.com|click\.(?:sendgrid|mailchimp)|\/click(?:\/|\?|$)/i;

const PROMO_URL_RE =
  /shop|play|claim|bonus|promo|offer|deposit|spin|casino|register|signup|sign-up|get-started|cta|reward|package|bundle|buy|purchase/i;

const PROMO_ANCHOR_RE =
  /shop now|play now|claim|get bonus|get offer|deposit|spin|buy now|purchase|redeem|click here|play free|join now|tap the button|enjoy your next spin/i;

function normalizeUrl(url: string): string {
  return url.replace(/[,.)]+$/, "").trim();
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function isNonDealUrl(url: string): boolean {
  if (NON_DEAL_URL_RE.test(url)) return true;
  if (EMAIL_ASSET_RE.test(url)) return true;
  const path = pathnameOf(url);
  return IMAGE_EXT_RE.test(path) || IMAGE_EXT_RE.test(url);
}

function isDenied(url: string): boolean {
  return DENY_URL_RE.test(url) || isNonDealUrl(url);
}

function parseSenderDomain(from: string | undefined): string | null {
  if (!from) return null;
  const angle = from.match(/<([^>]+@[^>]+)>/);
  const email = angle?.[1] ?? from.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase();
}

function hostMatchesSender(url: string, senderDomain: string | null): boolean {
  if (!senderDomain) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === senderDomain || host.endsWith(`.${senderDomain}`);
  } catch {
    return false;
  }
}

function scoreUrl(
  url: string,
  anchorText?: string,
  subject?: string,
  from?: string,
): number {
  if (!isHttpUrl(url)) return -100;
  if (isDenied(url)) return -50;

  let score = 0;
  if (PROMO_URL_RE.test(url)) score += 3;
  if (anchorText && PROMO_ANCHOR_RE.test(anchorText)) score += 4;
  if (anchorText && PROMO_URL_RE.test(anchorText)) score += 2;
  if (subject && PROMO_URL_RE.test(subject)) score += 1;
  if (ESP_TRACKING_RE.test(url)) score -= 3;
  if (hostMatchesSender(url, parseSenderDomain(from))) score += 3;
  return score;
}

function extractAnchorsFromHtml(html: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const re = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = normalizeUrl(m[1].trim());
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (isHttpUrl(url)) out.push({ url, text });
  }
  return out;
}

export function extractAnchorHrefs(html: string): string[] {
  return extractAnchorsFromHtml(html).map(({ url }) => url);
}

function fallbackLink(links: string[], context?: PickDealLinkContext): string | null {
  for (const link of links) {
    const normalized = normalizeUrl(link);
    const score = scoreUrl(normalized, undefined, context?.subject, context?.from);
    if (score <= 0) continue;
    if (normalized.startsWith("https://")) return normalized;
  }
  for (const link of links) {
    const normalized = normalizeUrl(link);
    const score = scoreUrl(normalized, undefined, context?.subject, context?.from);
    if (score > 0 && normalized.startsWith("http://")) return normalized;
  }
  return null;
}

export function pickDealLink(links: string[], context?: PickDealLinkContext): string | null {
  const subject = context?.subject;
  const from = context?.from;
  const candidates = new Map<string, number>();

  const addCandidate = (url: string, anchorText?: string) => {
    const normalized = normalizeUrl(url);
    if (!isHttpUrl(normalized)) return;
    const score = scoreUrl(normalized, anchorText, subject, from);
    if (score <= -50) return;
    const prev = candidates.get(normalized) ?? -100;
    candidates.set(normalized, Math.max(prev, score));
  };

  if (context?.html) {
    for (const { url, text } of extractAnchorsFromHtml(context.html)) {
      addCandidate(url, text);
    }
  }

  for (const link of links) addCandidate(link);

  let bestUrl: string | null = null;
  let bestScore = -1;
  for (const [url, score] of candidates) {
    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }

  if (bestUrl && bestScore > 0) return bestUrl;

  return fallbackLink(links, context);
}
