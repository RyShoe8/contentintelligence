import { google, type gmail_v1 } from "googleapis";
import type { GmailInputConfig } from "@content-resourcer/db";
import { env } from "./env.js";
import { buildGmailQuery } from "./gmail-query.js";

export type NormalizedMessage = {
  external_id: string;
  subject: string;
  raw_content: string;
  from: string;
  dateMs: number;
  links: string[];
};

export type NormalizedMessageWithPayload = {
  normalized: NormalizedMessage;
  payload: gmail_v1.Schema$MessagePart | undefined;
};

export function createGmailClient(refreshToken: string) {
  const oauth2 = new google.auth.OAuth2(
    env.gmailClientId,
    env.gmailClientSecret,
    env.gmailRedirectUri,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

export async function listMessageIds(
  gmail: gmail_v1.Gmail,
  config: GmailInputConfig,
  maxResults = 100,
  effectiveLookbackHours?: number,
): Promise<string[]> {
  const q = buildGmailQuery(
    config,
    effectiveLookbackHours != null ? { lookbackHours: effectiveLookbackHours } : undefined,
  );
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: Math.min(100, maxResults - ids.length),
      pageToken,
    });
    for (const m of res.data.messages ?? []) {
      if (m.id) ids.push(m.id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < maxResults);
  return ids;
}

export async function getNormalizedMessageAndPayload(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<NormalizedMessageWithPayload | null> {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  const msg = res.data;
  if (!msg.id) return null;

  const headers = msg.payload?.headers ?? [];
  const subject = getHeader(headers, "Subject") ?? "(no subject)";
  const from = getHeader(headers, "From") ?? "";
  const dateHeader = getHeader(headers, "Date");
  const dateMs = dateHeader ? Date.parse(dateHeader) || Date.now() : Date.now();

  const { text, html } = extractBodies(msg.payload);
  const raw = [subject, "", text || "", "", html || ""].join("\n").trim();
  const links = extractLinksFromPayload(msg.payload);

  return {
    normalized: {
      external_id: msg.id,
      subject,
      raw_content: raw.slice(0, 500_000),
      from,
      dateMs,
      links,
    },
    payload: msg.payload,
  };
}

export async function getNormalizedMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<NormalizedMessage | null> {
  const r = await getNormalizedMessageAndPayload(gmail, messageId);
  return r?.normalized ?? null;
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string,
): string | undefined {
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return h?.value ?? undefined;
}

function extractBodies(part: gmail_v1.Schema$MessagePart | undefined): {
  text: string;
  html: string;
} {
  if (!part) return { text: "", html: "" };
  let text = "";
  let html = "";
  const mime = part.mimeType ?? "";
  if (mime === "text/plain" && part.body?.data) {
    text += decodeBase64Url(part.body.data);
  }
  if (mime === "text/html" && part.body?.data) {
    html += decodeBase64Url(part.body.data);
  }
  for (const p of part.parts ?? []) {
    const sub = extractBodies(p);
    text += sub.text;
    html += sub.html;
  }
  return { text, html };
}

/** Concatenated HTML bodies from a Gmail message part tree (for img src parsing). */
export function extractHtmlFromPayload(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  let html = "";
  const mime = part.mimeType ?? "";
  if (mime === "text/html" && part.body?.data) {
    html += decodeBase64Url(part.body.data);
  }
  for (const p of part.parts ?? []) {
    html += extractHtmlFromPayload(p);
  }
  return html;
}

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function extractLinksFromPayload(part: gmail_v1.Schema$MessagePart | undefined): string[] {
  const { text, html } = extractBodies(part);
  const combined = `${text}\n${html}`;
  const urls = new Set<string>();
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(combined)) !== null) {
    urls.add(m[0].replace(/[,.)]+$/, ""));
  }
  return [...urls];
}
