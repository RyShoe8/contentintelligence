import type { EmailImage } from "@content-resourcer/db";
import { lookup } from "node:dns/promises";
import type { gmail_v1 } from "googleapis";
import { env } from "./env.js";
import { shouldSkipEmailImage } from "./email-image-filter.js";
import { extractHtmlFromPayload } from "./gmail-client.js";
import { ingestLog, ingestVerbose } from "./ingest-log.js";

const MAX_REDIRECTS = 8;

const ALLOWED = new Map<string, EmailImage["mime"]>([
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/gif", "image/gif"],
  ["image/webp", "image/webp"],
]);

const IMAGE_PATH_EXT = /\.(png|jpe?g|gif|webp)(\?|#|$)/i;

function maxImages(): number {
  return Math.max(1, Math.min(25, env.emailImageMaxCount));
}

function maxB64PerImage(): number {
  return Math.max(10_000, env.emailImageMaxB64PerImage);
}

function maxTotalB64(): number {
  return Math.max(50_000, env.emailImageMaxTotalB64);
}

function urlSafeB64ToStandard(b64: string): string {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = std.length % 4 === 0 ? "" : "=".repeat(4 - (std.length % 4));
  return std + pad;
}

function collectAttachmentImageParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: { attachmentId: string; mime: string; filename?: string }[],
): void {
  if (!part) return;
  const mime = part.mimeType ?? "";
  const aid = part.body?.attachmentId;
  if (mime.startsWith("image/") && aid) {
    const fn = part.filename?.trim() || undefined;
    out.push({ attachmentId: aid, mime, filename: fn });
  }
  for (const p of part.parts ?? []) {
    collectAttachmentImageParts(p, out);
  }
}

function collectInlineImageDataParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: { mime: string; data: string; filename?: string }[],
): void {
  if (!part) return;
  const mime = part.mimeType ?? "";
  const data = part.body?.data;
  const aid = part.body?.attachmentId;
  if (mime.startsWith("image/") && data && !aid) {
    const fn = part.filename?.trim() || undefined;
    out.push({ mime, data, filename: fn });
  }
  for (const p of part.parts ?? []) {
    collectInlineImageDataParts(p, out);
  }
}

function ipv4ToUint(s: string): number | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = (n << 8) | x;
  }
  return n >>> 0;
}

function isIPv4Private(n: number): boolean {
  const o1 = n >>> 24;
  const o2 = (n >>> 16) & 0xff;
  if (o1 === 10) return true;
  if (o1 === 127) return true;
  if (o1 === 0) return true;
  if (o1 === 169 && o2 === 254) return true;
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  if (o1 === 192 && o2 === 168) return true;
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
  if (o1 === 192 && o2 === 0 && (n & 0xff00) === 0) return true;
  const hi16 = n >>> 16;
  if (hi16 === 0xc612 || hi16 === 0xc613) return true;
  if (o1 >= 224) return true;
  return false;
}

function isAddressPrivate(address: string): boolean {
  if (address.includes(":")) {
    const a = address.toLowerCase();
    if (a === "::1") return true;
    if (a.startsWith("fe80:") || a.startsWith("fec0:")) return true;
    if (a.startsWith("fc") || a.startsWith("fd")) return true;
    if (a.startsWith("ff")) return true;
    const m = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(a);
    if (m) {
      const n = ipv4ToUint(m[1]);
      return n != null && isIPv4Private(n);
    }
    return false;
  }
  const n = ipv4ToUint(address);
  return n != null && isIPv4Private(n);
}

async function assertUrlSafeForFetch(urlStr: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("invalid_url");
  }
  if (u.protocol !== "https:") throw new Error("non_https");
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) throw new Error("blocked_host");
  if (u.username || u.password) throw new Error("credentials_in_url");
  const records = await lookup(host, { all: true });
  for (const r of records) {
    if (isAddressPrivate(r.address)) throw new Error("private_ip");
  }
  return u;
}

function normalizeHtmlAttrUrl(s: string): string {
  return s.replace(/&amp;/gi, "&").replace(/&#38;/g, "&").trim();
}

function pushHttpsImgUrl(seen: Set<string>, ordered: string[], raw: string): void {
  const norm = normalizeHtmlAttrUrl(raw);
  if (!norm.toLowerCase().startsWith("https://")) return;
  let u: URL;
  try {
    u = new URL(norm);
  } catch {
    return;
  }
  if (u.protocol !== "https:") return;
  const href = u.href;
  if (seen.has(href)) return;
  seen.add(href);
  ordered.push(href);
}

/** Ordered unique https image URLs from img src (quoted + unquoted) and background-image (extension paths only). */
function extractHttpsImageUrlsFromHtml(html: string): { withExt: string[]; probeMime: string[] } {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const reQuoted = /<img\b[^>]*\bsrc\s*=\s*(["'])(https:\/\/[^"']+)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = reQuoted.exec(html)) !== null) {
    pushHttpsImgUrl(seen, ordered, m[2] ?? "");
  }

  const reUnquoted = /<img\b[^>]*\bsrc\s*=\s*(https:\/\/[^\s>"']+)/gi;
  while ((m = reUnquoted.exec(html)) !== null) {
    pushHttpsImgUrl(seen, ordered, m[1] ?? "");
  }

  const reBg = /url\s*\(\s*["']?(https:\/\/[^"')]+\.(?:png|jpe?g|gif|webp)[^"')]*)["']?\s*\)/gi;
  while ((m = reBg.exec(html)) !== null) {
    pushHttpsImgUrl(seen, ordered, m[1] ?? "");
  }

  const withExt: string[] = [];
  const probeMime: string[] = [];
  for (const href of ordered) {
    try {
      const p = new URL(href).pathname;
      if (IMAGE_PATH_EXT.test(p)) withExt.push(href);
      else probeMime.push(href);
    } catch {
      continue;
    }
  }
  return { withExt, probeMime };
}

function mimeFromContentTypeHeader(ct: string | null): string | undefined {
  if (!ct) return undefined;
  const main = ct.split(";")[0]?.trim().toLowerCase();
  return main || undefined;
}

async function readResponseBodyWithLimit(res: Response, maxBytes: number): Promise<ArrayBuffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out.buffer;
}

function canonicalFromPathname(pathname: string): EmailImage["mime"] | undefined {
  const p = pathname.toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".webp")) return "image/webp";
  return undefined;
}

/**
 * Fetch remote image. When trustMimeTypeOnly, path may lack extension; MIME must come from Content-Type.
 */
async function fetchRemoteImageAsEmailImage(
  urlStr: string,
  trustMimeTypeOnly: boolean,
): Promise<EmailImage | null> {
  const timeoutMs = Math.max(1000, env.emailImageFetchTimeoutMs);
  const maxBytes = Math.max(1024, env.emailImageFetchMaxBytes);
  const perB64 = maxB64PerImage();
  let current = urlStr;

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    await assertUrlSafeForFetch(current);
    const pathname = (() => {
      try {
        return new URL(current).pathname;
      } catch {
        return "";
      }
    })();
    let expectedMime = canonicalFromPathname(pathname);
    if (!expectedMime && !trustMimeTypeOnly) return null;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/png,image/jpeg,image/gif,image/webp,*/*;q=0.1",
          "User-Agent": "ContentIntelligence-Ingest/1.0",
        },
      });
    } catch {
      clearTimeout(t);
      return null;
    } finally {
      clearTimeout(t);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      try {
        current = new URL(loc, current).href;
      } catch {
        return null;
      }
      continue;
    }

    if (!res.ok || res.status !== 200) return null;

    const ct = mimeFromContentTypeHeader(res.headers.get("content-type"));
    let canonical = ct ? ALLOWED.get(ct) : undefined;
    if (!canonical && expectedMime) canonical = expectedMime;
    if (!canonical) return null;

    const buf = await readResponseBodyWithLimit(res, maxBytes);
    if (!buf || buf.byteLength === 0) return null;
    const rawB64 = Buffer.from(buf).toString("base64");
    if (rawB64.length > perB64) return null;

    return {
      mime: canonical,
      data_base64: rawB64,
      filename: undefined,
    };
  }

  return null;
}

function pushIfFits(out: EmailImage[], totalB64: { n: number }, img: EmailImage): boolean {
  const per = maxB64PerImage();
  const cap = maxTotalB64();
  if (img.data_base64.length > per) return false;
  if (totalB64.n + img.data_base64.length > cap) return false;
  out.push(img);
  totalB64.n += img.data_base64.length;
  return true;
}

/**
 * Download inline/attached images from a Gmail message (best-effort, size-capped for Mongo).
 * Order: Gmail attachment parts, inline base64 image parts, then hotlinked https img URLs (optional).
 */
export async function fetchEmailImageAttachments(
  gmail: gmail_v1.Gmail,
  messageId: string,
  payload: gmail_v1.Schema$MessagePart | undefined,
): Promise<EmailImage[]> {
  const capN = maxImages();
  const attachmentRefs: { attachmentId: string; mime: string; filename?: string }[] = [];
  collectAttachmentImageParts(payload, attachmentRefs);

  const inlineRefs: { mime: string; data: string; filename?: string }[] = [];
  collectInlineImageDataParts(payload, inlineRefs);

  const out: EmailImage[] = [];
  const totalB64 = { n: 0 };
  let fromAttachment = 0;
  let fromInline = 0;
  let fromRemote = 0;
  let skippedGeneric = 0;

  for (const ref of attachmentRefs) {
    if (out.length >= capN) break;
    const canonical = ALLOWED.get(ref.mime.toLowerCase());
    if (!canonical) continue;

    let rawB64: string;
    try {
      const res = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: ref.attachmentId,
      });
      const data = res.data.data;
      if (!data || typeof data !== "string") continue;
      rawB64 = urlSafeB64ToStandard(data.replace(/\s/g, ""));
    } catch {
      continue;
    }

    if (Buffer.from(rawB64, "base64").length === 0) continue;
    if (shouldSkipEmailImage({ filename: ref.filename, dataBase64: rawB64 })) {
      skippedGeneric++;
      continue;
    }
    if (pushIfFits(out, totalB64, { mime: canonical, data_base64: rawB64, filename: ref.filename })) {
      fromAttachment++;
    }
  }

  for (const ref of inlineRefs) {
    if (out.length >= capN) break;
    const canonical = ALLOWED.get(ref.mime.toLowerCase());
    if (!canonical) continue;
    let rawB64: string;
    try {
      rawB64 = urlSafeB64ToStandard(ref.data.replace(/\s/g, ""));
    } catch {
      continue;
    }
    if (Buffer.from(rawB64, "base64").length === 0) continue;
    if (shouldSkipEmailImage({ filename: ref.filename, dataBase64: rawB64 })) {
      skippedGeneric++;
      continue;
    }
    if (pushIfFits(out, totalB64, { mime: canonical, data_base64: rawB64, filename: ref.filename })) {
      fromInline++;
    }
  }

  if (env.emailImageFetchRemote && out.length < capN && totalB64.n < maxTotalB64()) {
    const html = extractHtmlFromPayload(payload);
    const { withExt, probeMime } = extractHttpsImageUrlsFromHtml(html);
    const remoteUrls = [...withExt, ...probeMime];
    for (const url of remoteUrls) {
      if (out.length >= capN) break;
      if (totalB64.n >= maxTotalB64()) break;
      if (shouldSkipEmailImage({ url })) {
        skippedGeneric++;
        continue;
      }
      const trustMime = probeMime.includes(url);
      let img: EmailImage | null = null;
      try {
        img = await fetchRemoteImageAsEmailImage(url, trustMime);
      } catch {
        img = null;
      }
      if (
        img &&
        shouldSkipEmailImage({ url, dataBase64: img.data_base64, filename: img.filename })
      ) {
        skippedGeneric++;
        continue;
      }
      if (img && pushIfFits(out, totalB64, img)) {
        fromRemote++;
      }
    }
  }

  if (ingestVerbose()) {
    ingestLog("email_images_stats", {
      messageId,
      total: out.length,
      fromAttachment,
      fromInline,
      fromRemote,
      skippedGeneric,
    });
  }

  return out;
}
