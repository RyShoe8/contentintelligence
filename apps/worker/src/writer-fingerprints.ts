import type { Db } from "mongodb";
import { mergeVoiceBrandMemory } from "@content-resourcer/db";
import { extractHumanFingerprintsFromHtml } from "./services/rewriter/extract-human-fingerprints.js";

export type WriterFingerprintsBody = {
  voice_id: string;
  organization_id: string;
  html: string;
};

export async function runWriterFingerprintsExtract(db: Db, body: WriterFingerprintsBody) {
  const voiceId = body.voice_id?.trim();
  const organizationId = body.organization_id?.trim();
  const html = body.html?.trim();
  if (!voiceId || !organizationId || !html) {
    throw new Error("voice_id, organization_id, and html are required");
  }

  const patch = await extractHumanFingerprintsFromHtml(html);
  const hasAny = Object.values(patch).some((v) => Array.isArray(v) && v.length > 0);
  if (!hasAny) {
    return { updated: false };
  }

  const voice = await mergeVoiceBrandMemory(db, voiceId, patch);
  if (!voice || voice.organization_id !== organizationId) {
    throw new Error("voice_not_found");
  }

  return { updated: true };
}
