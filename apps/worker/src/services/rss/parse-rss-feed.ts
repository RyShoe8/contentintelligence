import { XMLParser } from "fast-xml-parser";

export type RssFeedItem = {
  title: string;
  link: string;
  guid: string;
  publishedAt?: string;
  encodedHtml?: string;
  summaryText: string;
};

const MAX_ITEMS_DEFAULT = 15;

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHttpsUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:") return null;
    return u.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function readLink(row: Record<string, unknown>): string | null {
  const link = row.link;
  if (typeof link === "string") return normalizeHttpsUrl(link);
  if (Array.isArray(link)) {
    for (const entry of link) {
      if (typeof entry === "string") {
        const url = normalizeHttpsUrl(entry);
        if (url) return url;
      }
      if (entry && typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        const href = typeof obj["@_href"] === "string" ? obj["@_href"] : typeof obj.href === "string" ? obj.href : "";
        const url = normalizeHttpsUrl(href);
        if (url) return url;
      }
    }
  }
  if (link && typeof link === "object") {
    const obj = link as Record<string, unknown>;
    const href = typeof obj["@_href"] === "string" ? obj["@_href"] : typeof obj.href === "string" ? obj.href : "";
    return normalizeHttpsUrl(href);
  }
  return null;
}

function readGuid(row: Record<string, unknown>, link: string | null): string {
  const guid = row.guid ?? row.id;
  if (typeof guid === "string" && guid.trim()) return guid.trim();
  if (guid && typeof guid === "object") {
    const obj = guid as Record<string, unknown>;
    const text = typeof obj["#text"] === "string" ? obj["#text"] : typeof obj.text === "string" ? obj.text : "";
    if (text.trim()) return text.trim();
  }
  return link ?? "";
}

function coerceXmlText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"];
    if (typeof obj.text === "string") return obj.text;
  }
  return "";
}

function readEncodedContent(row: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(row)) {
    if (!/encoded|^content$/i.test(key)) continue;
    const text = coerceXmlText(value).trim();
    if (text && /<[a-z][\s\S]*>/i.test(text)) return text;
  }

  const raw =
    row["content:encoded"] ??
    row.content ??
    row["dc:content"] ??
    row.summary ??
    row.description ??
    "";
  return coerceXmlText(raw);
}

function readPublishedAt(row: Record<string, unknown>): string | undefined {
  const raw = row.pubDate ?? row.published ?? row.updated ?? row["dc:date"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}

function readTitle(row: Record<string, unknown>): string {
  const title = row.title;
  if (typeof title === "string") return title.trim();
  if (title && typeof title === "object") {
    const obj = title as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"].trim();
  }
  return "";
}

export function parseRssFeed(xml: string, maxItems = MAX_ITEMS_DEFAULT): RssFeedItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    removeNSPrefix: true,
  });
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];

  const root = parsed as Record<string, unknown>;
  const channel =
    (root.rss as Record<string, unknown> | undefined)?.channel ??
    root.feed ??
    root.channel;

  if (!channel || typeof channel !== "object") return [];

  const ch = channel as Record<string, unknown>;
  const rawItems = ch.item ?? ch.entry;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const out: RssFeedItem[] = [];
  for (const item of items) {
    if (out.length >= maxItems) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const link = readLink(row);
    if (!link) continue;

    const encoded = readEncodedContent(row);
    const encodedHtml = /<[a-z][\s\S]*>/i.test(encoded) ? encoded.trim() : "";
    const summarySource =
      typeof row.description === "string"
        ? row.description
        : typeof row.summary === "string"
          ? row.summary
          : encoded;
    const summaryText = stripHtmlToText(String(summarySource ?? ""));

    out.push({
      title: readTitle(row) || link,
      link,
      guid: readGuid(row, link),
      publishedAt: readPublishedAt(row),
      encodedHtml: encodedHtml || undefined,
      summaryText,
    });
  }

  return out;
}
