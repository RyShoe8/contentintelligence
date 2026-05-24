import { lookup } from "node:dns/promises";

const MAX_REDIRECTS = 8;

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

export async function assertUrlSafeForFetch(urlStr: string): Promise<URL> {
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

export async function readResponseBodyWithLimit(
  res: Response,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
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

export async function fetchSafeText(
  urlStr: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 500_000;
  let current = urlStr;

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    await assertUrlSafeForFetch(current);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*;q=0.8",
          "User-Agent": "ContentIntelligence-VoiceResearch/1.0",
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

    const buf = await readResponseBodyWithLimit(res, maxBytes);
    if (!buf) return null;
    return Buffer.from(buf).toString("utf8");
  }

  return null;
}
