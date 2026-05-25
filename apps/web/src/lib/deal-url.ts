/** Client-safe copy of packages/db deal-url (no MongoDB dependency). */

const NON_DEAL_URL_RE =
  /w3\.org\/1999\/xhtml|w3\.org\/TR\/|w3\.org\/2000\/|schemas\.microsoft\.com|xmlns|\.dtd(?:\?|$)|fonts\.googleapis\.com|fonts\.gstatic\.com|\/css(?:\?|\/|$)|\.css(?:\?|$)/i;

const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i;

const EMAIL_ASSET_RE = /responsysimages|\/assets\/responsys|_Email_|_600W\.png/i;

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function isNonDealUrl(url: string): boolean {
  if (!url?.trim()) return true;
  if (NON_DEAL_URL_RE.test(url)) return true;
  if (EMAIL_ASSET_RE.test(url)) return true;
  const path = pathnameOf(url);
  return IMAGE_EXT_RE.test(path) || IMAGE_EXT_RE.test(url);
}
