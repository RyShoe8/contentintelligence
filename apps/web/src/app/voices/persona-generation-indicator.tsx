"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { VoicePersonaStatus } from "@content-resourcer/db";
import { isPersonaPendingStale } from "./persona-poll";
import { formatPersonaErrorForDisplay } from "./persona-error-display";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

type PersonaStatusResponse = {
  persona_status?: VoicePersonaStatus;
  persona_error?: string;
  persona_generated_at?: string;
  persona_requested_at?: string;
  persona?: string;
  error?: string;
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
  personaRequestedAtIso?: string;
  initialStale?: boolean;
};

export function PersonaGenerationIndicator({
  voiceId,
  initialStatus,
  initialError,
  startPolling,
  voiceIdParam,
  generatingParam,
  personaRequestedAtIso,
  initialStale,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<VoicePersonaStatus>(initialStatus);
  const [error, setError] = useState(
    initialStale
      ? "Persona generation may have stalled on the worker. Use Retry below or check Render logs."
      : (initialError ?? ""),
  );
  const [message, setMessage] = useState("");
  const [polling, setPolling] = useState(
    startPolling && initialStatus === "pending" && !initialStale,
  );
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
    if (!voiceIdParam) return;
    router.replace(`/voices/${voiceIdParam}`);
  }, [router, voiceIdParam]);

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
        setError(formatPersonaErrorForDisplay(data.persona_error) || "Persona generation failed.");
        clearGeneratingParam();
        router.refresh();
      }
    },
    [clearGeneratingParam, router, stopPolling],
  );

  const handleStale = useCallback(() => {
    stopPolling();
    setMessage("");
    setError(
      "Persona generation may have stalled on the worker. Use Retry below or check Render logs.",
    );
    clearGeneratingParam();
  }, [clearGeneratingParam, stopPolling]);

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
        handleStale();
        return;
      }
      try {
        const r = await fetch(`/api/voices/${voiceId}/persona-status`, { cache: "no-store" });
        const data = (await r.json().catch(() => ({}))) as PersonaStatusResponse;
        if (!r.ok) {
          stopPolling();
          setMessage("");
          setError(data.error ?? `Status check failed (${r.status})`);
          clearGeneratingParam();
          return;
        }
        if (data.persona_status === "ready" || data.persona_status === "failed") {
          finish(data);
          return;
        }
        if (
          data.persona_status === "pending" &&
          isPersonaPendingStale({
            persona_status: "pending",
            persona_requested_at: data.persona_requested_at,
          })
        ) {
          handleStale();
        }
      } catch {
        // keep polling on transient network errors
      }
    };

    void tick();
    pollRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
  }, [clearGeneratingParam, finish, handleStale, stopPolling, voiceId]);

  useEffect(() => {
    if (startPolling && initialStatus === "pending" && !initialStale) {
      startPollingLoop();
    }
    return () => stopPolling();
  }, [initialStale, initialStatus, startPolling, startPollingLoop, stopPolling]);

  if (polling) {
    return (
      <div
        className="rounded border border-[var(--primary)]/30 bg-[var(--card)] px-3 py-2 text-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"
            aria-hidden
          />
          <span>{message || "Generating persona…"}</span>
          <button
            type="button"
            onClick={() => {
              stopPolling();
              setMessage("");
              clearGeneratingParam();
            }}
            className="ml-auto text-xs text-[var(--muted)] hover:text-[var(--primary)] hover:underline"
          >
            Dismiss
          </button>
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
