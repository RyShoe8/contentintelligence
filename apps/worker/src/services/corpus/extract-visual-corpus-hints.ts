import type { Voice } from "@content-resourcer/db";
import { fetchSafeText } from "../../safe-fetch.js";

const HEX_COLOR = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
const RGB_COLOR = /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi;
const FONT_FAMILY = /font-family:\s*([^;}"']+)/gi;
const IMG_ALT = /<img[^>]+alt=["']([^"']{3,80})["']/gi;
const IMG_SRC = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
const THEME_COLOR = /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i;
const OG_IMAGE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;

export type VisualCorpusHints = {
  promptBlock: string;
  hasSignals: boolean;
};

function uniqueColors(html: string, max = 12): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(HEX_COLOR)) {
    found.add(m[0]!.toLowerCase());
    if (found.size >= max) break;
  }
  for (const m of html.matchAll(RGB_COLOR)) {
    found.add(m[0]!.toLowerCase());
    if (found.size >= max) break;
  }
  return [...found];
}

function extractFonts(html: string, max = 6): string[] {
  const fonts = new Set<string>();
  for (const m of html.matchAll(FONT_FAMILY)) {
    const f = m[1]?.trim().slice(0, 80);
    if (f) fonts.add(f);
    if (fonts.size >= max) break;
  }
  return [...fonts];
}

function layoutKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const keys = [
    "dashboard",
    "hero",
    "grid",
    "card",
    "sidebar",
    "infographic",
    "terminal",
    "overlay",
  ];
  return keys.filter((k) => lower.includes(k));
}

function emojiDensity(text: string): string {
  const emoji = text.match(/\p{Extended_Pictographic}/gu);
  const count = emoji?.length ?? 0;
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  const ratio = count / words;
  if (ratio > 0.08) return "high";
  if (ratio > 0.02) return "moderate";
  return "low";
}

function analyzeHtml(label: string, html: string): string[] {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").slice(0, 80_000);
  const lines: string[] = [`### ${label}`];

  const theme = text.match(THEME_COLOR)?.[1];
  if (theme) lines.push(`theme-color: ${theme}`);

  const colors = uniqueColors(text);
  if (colors.length) lines.push(`colors: ${colors.join(", ")}`);

  const fonts = extractFonts(text);
  if (fonts.length) lines.push(`fonts: ${fonts.join("; ")}`);

  const layouts = layoutKeywords(text);
  if (layouts.length) lines.push(`layout cues: ${layouts.join(", ")}`);

  const alts: string[] = [];
  for (const m of text.matchAll(IMG_ALT)) {
    alts.push(m[1]!.trim());
    if (alts.length >= 5) break;
  }
  if (alts.length) lines.push(`image alts: ${alts.join(" | ")}`);

  const og = text.match(OG_IMAGE)?.[1];
  if (og) lines.push(`og:image: ${og.slice(0, 200)}`);

  const imgUrls: string[] = [];
  for (const m of text.matchAll(IMG_SRC)) {
    imgUrls.push(m[1]!);
    if (imgUrls.length >= 5) break;
  }
  if (imgUrls.length) lines.push(`sample images: ${imgUrls.join(" | ")}`);

  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (plain) {
    lines.push(`emoji density: ${emojiDensity(plain)}`);
    lines.push(`text sample: ${plain.slice(0, 600)}`);
  }

  return lines.length > 1 ? lines : [];
}

export async function extractVisualCorpusHints(voice: Voice): Promise<VisualCorpusHints> {
  const sections: string[] = [];

  if (voice.keywords.length) {
    sections.push(`### Keywords\n${voice.keywords.join(", ")}`);
  }

  if (voice.website_url) {
    const html = await fetchSafeText(voice.website_url);
    if (html) sections.push(...analyzeHtml(`Website: ${voice.website_url}`, html));
  }

  for (const link of voice.social_links) {
    const label = link.label ? `${link.label} (${link.url})` : link.url;
    const html = await fetchSafeText(link.url);
    if (html) sections.push(...analyzeHtml(`Social: ${label}`, html));
  }

  const promptBlock = sections.join("\n").trim();
  return {
    promptBlock,
    hasSignals: promptBlock.length > 40,
  };
}
