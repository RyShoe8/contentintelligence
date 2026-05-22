"use client";

import { useEffect, useState } from "react";

type HealthPayload = {
  workerConfigured: boolean;
  workerOk?: boolean;
  vercelGmail: { configured: boolean; clientIdSuffix: string | null };
  workerGmail: { configured?: boolean; clientIdSuffix?: string | null } | null;
  clientIdMatch: boolean | null;
  error?: string;
};

export function GmailOAuthDiagnostics() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/worker/health");
        const json = (await r.json()) as HealthPayload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-xs text-[var(--muted)]">Checking Gmail OAuth alignment…</p>;
  }
  if (!data?.vercelGmail.configured) {
    return null;
  }
  if (!data.workerConfigured) {
    return (
      <p className="text-xs text-[var(--muted)]">
        Set <code className="text-[var(--fg)]">WORKER_URL</code> on Vercel to compare worker Gmail client with this app.
      </p>
    );
  }
  if (data.error || data.workerOk === false) {
    return (
      <p className="text-xs text-amber-200/90">
        Could not reach the worker health endpoint{data.error ? `: ${data.error}` : ""}.
      </p>
    );
  }
  if (data.clientIdMatch === false) {
    return (
      <p className="rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-200">
        Gmail OAuth client mismatch: Vercel client ID ends with{" "}
        <strong>{data.vercelGmail.clientIdSuffix}</strong>, Render ends with{" "}
        <strong>{data.workerGmail?.clientIdSuffix ?? "?"}</strong>. Use the same{" "}
        <code className="text-[var(--fg)]">GMAIL_CLIENT_ID</code> and{" "}
        <code className="text-[var(--fg)]">GMAIL_CLIENT_SECRET</code> on both platforms, then
        Re-connect Gmail.
      </p>
    );
  }
  if (data.clientIdMatch === true) {
    return (
      <p className="text-xs text-green-400/90">
        Vercel and Render use the same Gmail OAuth client (ID …{data.vercelGmail.clientIdSuffix}).
      </p>
    );
  }
  return null;
}
