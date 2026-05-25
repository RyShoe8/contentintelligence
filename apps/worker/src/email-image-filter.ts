/** Heuristics to skip social icons, app-store badges, spacers, and other non-promo images. */

const GENERIC_URL_RE =
  /facebook\.com|instagram\.com|twitter\.com|(?:^|\/)x\.com|linkedin\.com|youtube\.com|tiktok\.com|pinterest\.com|snapchat\.com|apps\.apple\.com|play\.google\.com|itunes\.apple\.com|app-store|appstore|google-play|play-store|(?:^|[/._-])(?:social|icons?|share|footer-icon|footer_icon)(?:[/._-]|$)/i;

const GENERIC_PATH_RE =
  /[/._-](?:social|icons?|share|footer-icon|footer_icon|app-store|appstore|google-play|play-store|badge|spacer|pixel|tracking|1x1|transparent)(?:[/._-]|\.)/i;

const GENERIC_FILENAME_RE =
  /(?:^|[/\\])(?:[^/\\]*(?:icon|logo|social|badge|app[-_]?store|play[-_]?store|google[-_]?play|spacer|pixel|tracking|1x1|transparent|btn[-_]|button[-_])[^/\\]*\.(?:png|jpe?g|gif|webp)$)|(?:^|[/\\])[^/\\]*(?:facebook|instagram|twitter|linkedin|youtube|tiktok|pinterest|snapchat)[^/\\]*\.(?:png|jpe?g|gif|webp)$/i;

const MAX_ICON_DIMENSION = 96;
const TINY_BYTES = 1536;

export type EmailImageFilterContext = {
  filename?: string;
  url?: string;
  dataBase64?: string;
};

function haystackFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function matchesGenericUrl(url: string): boolean {
  const hay = haystackFromUrl(url);
  return GENERIC_URL_RE.test(hay) || GENERIC_PATH_RE.test(hay);
}

function matchesGenericFilename(filename: string): boolean {
  const name = filename.trim();
  if (!name) return false;
  return GENERIC_FILENAME_RE.test(name) || GENERIC_PATH_RE.test(name.toLowerCase());
}

/** Read width/height from PNG, GIF, JPEG, or WebP headers without a full decode. */
export function readImageDimensionsFromBuffer(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;

  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  if (buf.toString("ascii", 0, 3) === "GIF" && buf.length >= 10) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = buf.readUInt16BE(i + 5);
        const w = buf.readUInt16BE(i + 7);
        if (w > 0 && h > 0) return { width: w, height: h };
      }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }

  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buf.length >= 30) {
      const w = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
      const h = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
      return { width: w, height: h };
    }
    if (chunk === "VP8 " && buf.length >= 30) {
      const w = buf.readUInt16LE(26) & 0x3fff;
      const h = buf.readUInt16LE(28) & 0x3fff;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  }

  return null;
}

function isSmallIconDimensions(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= MAX_ICON_DIMENSION && height <= MAX_ICON_DIMENSION;
}

function isTinySquarePayload(byteLength: number, width: number, height: number): boolean {
  if (byteLength >= TINY_BYTES || width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= 0.75 && ratio <= 1.33;
}

function matchesGenericPayload(dataBase64: string): boolean {
  let buf: Buffer;
  try {
    buf = Buffer.from(dataBase64.replace(/\s/g, ""), "base64");
  } catch {
    return false;
  }
  if (buf.length === 0) return true;

  const dims = readImageDimensionsFromBuffer(buf);
  if (dims && isSmallIconDimensions(dims.width, dims.height)) {
    return true;
  }
  if (dims && isTinySquarePayload(buf.length, dims.width, dims.height)) {
    return true;
  }

  return false;
}

/** Return true when the image should not be ingested or shown. */
export function shouldSkipEmailImage(ctx: EmailImageFilterContext): boolean {
  if (ctx.url?.trim() && matchesGenericUrl(ctx.url.trim())) {
    return true;
  }
  if (ctx.filename?.trim() && matchesGenericFilename(ctx.filename.trim())) {
    return true;
  }
  if (ctx.dataBase64?.trim()) {
    return matchesGenericPayload(ctx.dataBase64.trim());
  }
  return false;
}
