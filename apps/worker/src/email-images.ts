import type { EmailImage } from "@content-resourcer/db";
import type { gmail_v1 } from "googleapis";

const MAX_IMAGES = 5;
/** Max stored base64 length per image (roughly < 300KB binary). */
const MAX_B64_PER_IMAGE = 400_000;
const MAX_TOTAL_B64 = 1_400_000;

const ALLOWED = new Map<string, EmailImage["mime"]>([
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/gif", "image/gif"],
  ["image/webp", "image/webp"],
]);

function collectImageParts(
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
    collectImageParts(p, out);
  }
}

function urlSafeB64ToStandard(b64: string): string {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = std.length % 4 === 0 ? "" : "=".repeat(4 - (std.length % 4));
  return std + pad;
}

/**
 * Download inline/attached images from a Gmail message (best-effort, size-capped for Mongo).
 */
export async function fetchEmailImageAttachments(
  gmail: gmail_v1.Gmail,
  messageId: string,
  payload: gmail_v1.Schema$MessagePart | undefined,
): Promise<EmailImage[]> {
  const refs: { attachmentId: string; mime: string; filename?: string }[] = [];
  collectImageParts(payload, refs);
  const out: EmailImage[] = [];
  let totalB64 = 0;

  for (const ref of refs.slice(0, MAX_IMAGES)) {
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

    if (rawB64.length > MAX_B64_PER_IMAGE) continue;
    if (totalB64 + rawB64.length > MAX_TOTAL_B64) break;

    out.push({
      mime: canonical,
      data_base64: rawB64,
      filename: ref.filename,
    });
    totalB64 += rawB64.length;
  }

  return out;
}
