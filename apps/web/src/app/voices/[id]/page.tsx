import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ensureIndexes,
  listContentSignals,
  getVoice,
  listWriterStyleExamplesForVoice,
  updateVoicePersonaStatus,
  writerArticleHtmlForLearning,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import {
  deleteVoiceAction,
  generateVoicePersonaAction,
  retryVoicePersonaAction,
  saveVoiceAction,
} from "../actions";
import { isPersonaPendingStale, shouldPollPersona } from "../persona-poll";
import { BrandMentionSlider } from "../brand-mention-slider";
import { SourcesInPostsSlider } from "../sources-in-posts-slider";
import { DistributionPlatformsEditor } from "../distribution-platforms-editor";
import { PreferredPhrasesEditor } from "../preferred-phrases-editor";
import { PersonaGenerationIndicator } from "../persona-generation-indicator";
import { StyleExamplesSyncIndicator } from "../style-examples-sync-indicator";
import { VOICE_FIELD_TIPS } from "../field-help";
import { LocalDateTime } from "@/components/local-date-time";
import { LabelWithTip } from "../../signals/label-with-tip";
import {
  VoiceStyleExamplesEditor,
  type VoiceStyleExampleItem,
} from "@/components/voice-style-examples-editor";
import {
  formatPersonaErrorForDisplay,
  isFixedRhythmSamplePersonaError,
} from "../persona-error-display";

export const dynamic = "force-dynamic";

function socialLinksToText(links: { label?: string; url: string }[]): string {
  return links
    .map((l) => (l.label ? `${l.label}|${l.url}` : l.url))
    .join("\n");
}

function decodeErrorDetail(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function VoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    generating?: string;
    error?: string;
    error_detail?: string;
    style_example_saved?: string;
    style_example_deleted?: string;
    style_sync?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const [voiceRaw, contentSignals] = await Promise.all([
    getVoice(db, id),
    listContentSignals(db, { organizationId: orgId }),
  ]);

  // Auth check
  let voice =
    voiceRaw && voiceRaw.organization_id === orgId ? voiceRaw : null;

  // Voice not found UI
  if (!voice) {
    return (
      <div className="animate-fade-in space-y-6">
        <Link
          href="/voices"
          className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          My Voice
        </Link>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-7 w-7 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="mb-1 text-lg font-semibold text-[var(--fg)]">
            Voice not found
          </h2>
          <p className="mb-6 text-sm text-[var(--muted)]">
            This voice doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <Link href="/voices" className="ui-btn-primary px-5 py-2.5 text-sm">
            ← Back to My Voice
          </Link>
        </div>
      </div>
    );
  }

  // Fix stale rhythm sample error
  if (
    voice.persona_status === "failed" &&
    isFixedRhythmSamplePersonaError(voice.persona_error)
  ) {
    await updateVoicePersonaStatus(db, voice.id, {
      persona_status: "failed",
      persona_error: undefined,
    });
    voice = { ...voice, persona_error: undefined };
  }

  // Redirect if generate_failed was already fixed
  if (sp.error === "generate_failed") {
    const detail = decodeErrorDetail(sp.error_detail);
    if (!detail || isFixedRhythmSamplePersonaError(detail)) {
      const params = new URLSearchParams();
      if (sp.generating === "1") params.set("generating", "1");
      if (sp.style_sync === "1") params.set("style_sync", "1");
      if (sp.saved === "1") params.set("saved", "1");
      const qs = params.toString();
      redirect(`/voices/${id}${qs ? `?${qs}` : ""}`);
    }
  }

  const workerConfigured = !!process.env.WORKER_URL;
  const personaStale = isPersonaPendingStale(voice);
  const personaPolling =
    shouldPollPersona(voice, sp.generating) && !personaStale;
  const styleSyncPolling =
    sp.style_sync === "1" && !!voice.rss_feed_url?.trim();

  const styleExamples: VoiceStyleExampleItem[] = (
    await listWriterStyleExamplesForVoice(db, orgId, voice.id)
  ).map((ex) => {
    const html = writerArticleHtmlForLearning(ex);
    return {
      id: ex.id,
      title: ex.title,
      source_url: ex.reference_urls?.[0],
      updated_at: ex.updated_at.toISOString(),
      char_count: html.length,
    };
  });

  const errorMsg =
    sp.error === "name"
      ? "Enter a voice name."
      : sp.error === "not_found"
        ? "Voice not found."
        : sp.error === "generate_failed"
          ? (() => {
              const detail = decodeErrorDetail(sp.error_detail);
              const friendly = detail ? formatPersonaErrorForDisplay(detail) : "";
              return friendly
                ? `Could not start persona generation: ${friendly}`
                : "Could not start persona generation. Check worker configuration.";
            })()
          : sp.error === "missing_voice"
            ? "Select a voice to generate."
            : sp.error === "style_example_not_found"
              ? "Style example not found."
              : sp.error === "style_sync_unconfigured"
                ? "RSS import is not configured. Set WORKER_URL on Vercel to import style examples from your feed."
                : null;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Back link */}
      <Link
        href="/voices"
        className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        My Voice
      </Link>

      {/* Page title */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)]/20 to-[var(--accent)]/20 text-xl font-bold text-[var(--primary)]">
          {voice.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--fg)]">{voice.name}</h1>
          <p className="text-sm text-[var(--muted)]">Edit brand voice settings</p>
        </div>
      </div>

      {/* Status messages */}
      {sp.saved === "1" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          Voice saved successfully.
        </div>
      )}
      {sp.style_example_deleted === "1" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--muted)]">
          Style example removed. It will not be re-imported from RSS.
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Persona generation indicator */}
      <PersonaGenerationIndicator
        voiceId={voice.id}
        initialStatus={voice.persona_status}
        initialError={formatPersonaErrorForDisplay(voice.persona_error)}
        startPolling={personaPolling}
        voiceIdParam={voice.id}
        generatingParam={sp.generating}
        personaRequestedAtIso={voice.persona_requested_at?.toISOString()}
        initialStale={personaStale}
      />

      {/* Main form */}
      <div className="ui-card p-6">
        <form
          key={`${voice.id}-${voice.persona_generated_at?.getTime() ?? 0}-${voice.persona_status}`}
          action={saveVoiceAction}
          className="space-y-6"
        >
          <input type="hidden" name="voice_id" value={voice.id} />

          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="voice-name" className="text-sm text-[var(--muted)]">
              Voice Name
            </label>
            <input
              id="voice-name"
              name="name"
              required
              defaultValue={voice.name}
              className="ui-input"
              placeholder="Brand voice name"
            />
          </div>

          {/* Sliders */}
          <div className="grid gap-4 sm:grid-cols-2">
            <BrandMentionSlider defaultValue={voice.brand_mention_level ?? 50} />
            <SourcesInPostsSlider defaultValue={voice.sources_in_posts_level ?? 0} />
          </div>

          {/* URLs */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="voice-website"
                className="text-sm text-[var(--muted)]"
              >
                Website URL
              </label>
              <input
                id="voice-website"
                name="website_url"
                type="url"
                defaultValue={voice.website_url ?? ""}
                className="ui-input"
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="voice-rss"
                className="text-sm text-[var(--muted)]"
              >
                RSS Feed URL
              </label>
              <input
                id="voice-rss"
                name="rss_feed_url"
                type="url"
                defaultValue={voice.rss_feed_url ?? ""}
                className="ui-input"
                placeholder="https://example.com/feed.xml"
              />
            </div>
          </div>

          {/* Social links */}
          <div className="space-y-1">
            <label
              htmlFor="voice-social"
              className="text-sm text-[var(--muted)]"
            >
              Social profile links
            </label>
            <p className="text-xs text-[var(--muted)]">
              One URL per line. Optional label: Platform|https://…
            </p>
            <textarea
              id="voice-social"
              name="social_links"
              rows={4}
              defaultValue={socialLinksToText(voice.social_links)}
              className="ui-textarea"
              placeholder="https://twitter.com/brand"
            />
          </div>

          {/* Keywords */}
          <div className="space-y-1">
            <LabelWithTip
              htmlFor="voice-keywords"
              tip={VOICE_FIELD_TIPS.keywords}
            >
              Keywords (up to 5)
            </LabelWithTip>
            <p className="text-xs text-[var(--muted)]">
              One per line or comma-separated. Shapes persona and Writer style — not Writer research.
            </p>
            <textarea
              id="voice-keywords"
              name="keywords"
              rows={2}
              defaultValue={voice.keywords.join("\n")}
              className="ui-textarea"
              placeholder={"playful\nurgent\ntrusted"}
            />
          </div>

          {/* Distribution platforms */}
          <DistributionPlatformsEditor
            defaultPlatforms={voice.distribution_platforms ?? []}
          />

          {/* Preferred phrases */}
          <div className="space-y-1">
            <LabelWithTip
              htmlFor="voice-preferred-phrases"
              tip={VOICE_FIELD_TIPS.preferred_phrases}
            >
              Preferred phrases for posts
            </LabelWithTip>
            <p className="text-xs text-[var(--muted)]">
              Each phrase has its own frequency slider. At most one phrase is used per generated post; higher frequency phrases are preferred.
            </p>
            <PreferredPhrasesEditor defaultPhrases={voice.preferred_phrases ?? []} />
          </div>

          {/* Linked content signals */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-[var(--fg)]">
              Linked Topics
            </legend>
            <p className="text-xs text-[var(--muted)]">
              Routes Feed emails to Posts for this voice. Does not train persona or Writer style examples.
            </p>
            {contentSignals.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No topics yet.{" "}
                <Link
                  href="/topics"
                  className="text-[var(--primary)] hover:underline"
                >
                  Create one
                </Link>
                .
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {contentSignals.map((cs) => (
                  <label key={cs.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="content_signal_ids"
                      value={cs.id}
                      defaultChecked={voice.content_signal_ids.includes(cs.id)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <span className="text-[var(--fg)]">{cs.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {/* Persona template */}
          <div className="space-y-1">
            <LabelWithTip
              htmlFor="voice-persona"
              tip={VOICE_FIELD_TIPS.persona}
            >
              Persona template
            </LabelWithTip>
            <p className="text-xs text-[var(--muted)]">
              Writer and editorial voice from your website, RSS articles, social links, and keywords. Editable after generation. Usually takes 1–3 minutes.
            </p>
            <textarea
              id="voice-persona"
              name="persona"
              rows={12}
              defaultValue={voice.persona ?? ""}
              className="ui-textarea font-mono text-sm"
              placeholder={
                voice.persona_status === "ready"
                  ? ""
                  : "Generate a persona to populate this field…"
              }
            />
            {voice.persona_status === "failed" && voice.persona_error ? (
              <span className="text-xs text-red-400">
                {formatPersonaErrorForDisplay(voice.persona_error)}
              </span>
            ) : null}
            {voice.persona_generated_at ? (
              <LocalDateTime iso={voice.persona_generated_at.toISOString()} />
            ) : null}
          </div>

          {/* Style examples */}
          <VoiceStyleExamplesEditor
            voiceId={voice.id}
            rssFeedUrl={voice.rss_feed_url}
            examples={styleExamples}
            workerConfigured={workerConfigured}
            syncSummary={voice.style_examples_sync_summary}
            syncError={voice.style_examples_sync_error}
            syncSyncedAt={voice.style_examples_synced_at?.toISOString()}
            syncIndicator={
              <StyleExamplesSyncIndicator
                voiceId={voice.id}
                startPolling={styleSyncPolling}
                initialExampleCount={styleExamples.length}
                voiceIdParam={voice.id}
              />
            }
          />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-4">
            <button
              type="submit"
              className="ui-btn-primary px-5 py-2.5 text-sm font-semibold"
            >
              Save Voice
            </button>
            <button
              formAction={generateVoicePersonaAction}
              type="submit"
              disabled={
                !workerConfigured ||
                (personaPolling && voice.persona_status === "pending")
              }
              data-persona-generate
              className="ui-btn-secondary px-5 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {voice.persona_status === "ready"
                ? "Regenerate persona"
                : "Generate persona"}
            </button>
            {(voice.persona_status === "failed" || personaStale) &&
              voice.persona_status !== "ready" ? (
              <button
                formAction={retryVoicePersonaAction}
                type="submit"
                disabled={!workerConfigured}
                data-persona-generate
                className="rounded-lg border border-amber-500/50 px-5 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
              >
                Retry persona
              </button>
            ) : null}
            <button
              formAction={deleteVoiceAction}
              type="submit"
              className="ui-btn-danger px-5 py-2.5 text-sm font-medium"
            >
              Delete Voice
            </button>
          </div>

          {!workerConfigured && (
            <p className="text-xs text-[var(--muted)]">
              Set <code className="text-[var(--fg)]">WORKER_URL</code> on
              Vercel to enable persona generation.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
