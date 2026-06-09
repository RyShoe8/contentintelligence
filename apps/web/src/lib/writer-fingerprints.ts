export async function extractWriterFingerprints(
  voiceId: string,
  organizationId: string,
  html: string,
): Promise<void> {
  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.INGEST_SECRET) {
    headers["x-ingest-secret"] = process.env.INGEST_SECRET;
  }

  await fetch(`${base}/writer/fingerprints`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      voice_id: voiceId,
      organization_id: organizationId,
      html,
    }),
  });
}
