"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { VoicePersonaStatus } from "@content-resourcer/db";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

type PersonaStatusResponse = {
  persona_status?: VoicePersonaStatus;
  persona_error?: string;
  persona_generated_at?: string;
  persona?: string;
};

function applyPersonaToForm(persona: string | undefined) {
  if (persona == null) return;
  const el = document.querySelector<HTMLTextAreaElement>('textarea[name="persona"]');
  if (el) el.value = persona;
}

type Props = {
  voiceId: string;
  initialStatus: VoicePersonaStatus;
  initialError?: string;
  startPolling: boolean;
  voiceIdParam?: string;
  generatingParam?: string;
};

export function PersonaGenerationIndicator({
  voiceId,
  initialStatus,
  initialError,
  startPolling,
  voiceIdParam,
  generatingParam,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<VoicePersonaStatus>(initialStatus);
  const [error, setError] = useState(initialError ?? "");
  const [message, setMessage] = useState("");
  const [polling, setPolling] = useState(startPolling && initialStatus === "pending");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
    document.querySelectorAll("[data-persona-generate]").forEach((el) => {
      if (el instanceof HTMLButtonElement) el.disabled = false;
    });
  }, []);

  const clearGeneratingParam = useCallback(() => {
    if (generatingParam !== "1" || !voiceIdParam) return;
    router.replace(`/voices?voice_id=${voiceIdParam}`);
  }, [generatingParam, router, voiceIdParam]);

  const finish = useCallback(
    (data: PersonaStatusResponse) => {
      stopPolling();
      const next = data.persona_status ?? "pending";
      setStatus(next);
      if (next === "ready") {
        setMessage("Persona ready.");
        setError("");
        applyPersonaToForm(data.persona);
        clearGeneratingParam();
        router.refresh();
      } else if (next === "failed") {
        setMessage("");
        setError(data.persona_error ?? "Persona generation failed.");
        clearGeneratingParam();
        router.refresh();
      }
    },
    [clearGeneratingParam, router, stopPolling],
  );

  const startPollingLoop = useCallback(() => {
    stopPolling();
    setPolling(true);
    setMessage("Generating persona… Analyzing website, RSS, and social sources.");
    setError("");
    pollStartedRef.current = Date.now();

    document.querySelectorAll("[data-persona-generate]").forEach((el) => {
      if (el instanceof HTMLButtonElement) el.disabled = true;
    });

    const tick = async () => {
      if (Date.now() - pollStartedRef.current > POLL_TIMEOUT_MS) {
        stopPolling();
        setMessage("");
        setError("Persona generation is taking longer than expected. Refresh manually.");
        return;
      }
      try {
        const r = await fetch(`/api/voices/${voiceId}/persona-status`, { cache: "no-store" });
        const data = (await r.json().catch(() => ({}))) as PersonaStatusResponse;
        if (!r.ok) return;
        if (data.persona_status === "ready" || data.persona_status === "failed") {
          finish(data);
        }
      } catch {
        // keep polling on transient errors
      }
    };

    void tick();
    pollRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
  }, [finish, stopPolling, voiceId]);

  useEffect(() => {
    if (startPolling && initialStatus === "pending") {
      startPollingLoop();
    }
    return () => stopPolling();
  }, [initialStatus, startPolling, startPollingLoop, stopPolling]);

  if (polling) {
    return (
      <div
        className="rounded border border-[var(--primary)]/30 bg-[var(--card)] px-3 py-2 text-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"
            aria-hidden
          />
          <span>{message || "Generating persona…"}</span>
        </div>
      </div>
    );
  }

  if (message && status === "ready") {
    return (
      <p className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">
        {message}
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  return null;
}
