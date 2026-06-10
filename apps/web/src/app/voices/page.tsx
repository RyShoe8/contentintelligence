import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ensureIndexes,
  listContentSignals,
  listVoices,
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
} from "./actions";
import { isPersonaPendingStale, shouldPollPersona } from "./persona-poll";
import { BrandMentionSlider } from "./brand-mention-slider";
import { SourcesInPostsSlider } from "./sources-in-posts-slider";
import { DistributionPlatformsEditor } from "./distribution-platforms-editor";
import { PreferredPhrasesEditor } from "./preferred-phrases-editor";
import { PersonaGenerationIndicator } from "./persona-generation-indicator";
import { StyleExamplesSyncIndicator } from "./style-examples-sync-indicator";
import { VOICE_FIELD_TIPS } from "./field-help";
import { PageHeader } from "@/components/ui/page-header";
import { LocalDateTime } from "@/components/local-date-time";
import { LabelWithTip } from "../signals/label-with-tip";
import {
  VoiceStyleExamplesEditor,
  type VoiceStyleExampleItem,
} from "@/components/voice-style-examples-editor";
import {
  formatPersonaErrorForDisplay,
  isFixedRhythmSamplePersonaError,
} from "./persona-error-display";

export const dynamic = "force-dynamic";

function personaStatusLabel(
  status: string,
  inProgress?: boolean,
): string {
  if (inProgress) return "Generating…";
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  return "Pending";
}

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

export default async function VoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    voice_id?: string;
    saved?: string;
    deleted?: string;
    generating?: string;
    error?: string;
    error_detail?: string;
    style_example_saved?: string;
    style_example_deleted?: string;
    style_sync?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const voices = await listVoices(db, orgId);
  const contentSignals = await listContentSignals(db, { organizationId: orgId });
  const selectedId = sp.voice_id ?? "";
  const editing = selectedId ? await getVoice(db, selectedId) : null;
  let activeVoice =
    editing && editing.organization_id === orgId ? editing : null;

  if (activeVoice?.persona_status === "failed" && isFixedRhythmSamplePersonaError(activeVoice.persona_error)) {
    await updateVoicePersonaStatus(db, activeVoice.id, {
      persona_status: "failed",
      persona_error: undefined,
    });
    activeVoice = { ...activeVoice, persona_error: undefined };
  }

  if (selectedId && activeVoice && sp.error === "generate_failed") {
    const detail = decodeErrorDetail(sp.error_detail);
    if (!detail || isFixedRhythmSamplePersonaError(detail)) {
      const params = new URLSearchParams({ voice_id: selectedId });
      if (sp.generating === "1") params.set("generating", "1");
      if (sp.style_sync === "1") params.set("style_sync", "1");
      if (sp.saved === "1") params.set("saved", "1");
      redirect(`/voices?${params.toString()}`);
    }
  }

  const workerConfigured = !!process.env.WORKER_URL;
  const activePersonaStale = activeVoice
    ? isPersonaPendingStale(activeVoice)
    : false;
  const activePersonaPolling = activeVoice
    ? shouldPollPersona(activeVoice, sp.generating) && !activePersonaStale
    : false;
  const activeStyleSyncPolling =
    !!activeVoice && sp.style_sync === "1" && !!activeVoice.rss_feed_url?.trim();

  const styleExamples: VoiceStyleExampleItem[] = activeVoice
    ? (await listWriterStyleExamplesForVoice(db, orgId, activeVoice.id)).map((ex) => {
        const html = writerArticleHtmlForLearning(ex);
        return {
          id: ex.id,
          title: ex.title,
          source_url: ex.reference_urls?.[0],
          updated_at: ex.updated_at.toISOString(),
          char_count: html.length,
        };
      })
    : [];

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
    <div className="space-y-6">
      <PageHeader
        title="Voices"
        description="Define brand voices from your website, RSS, social profiles, and keywords. Persona and style apply when Writer writes an article; linked content signals route Feed emails to Posts only."
      />

      {sp.saved === "1" ? (
        <p className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">
          Voice saved.
        </p>
      ) : null}
      {sp.deleted === "1" ? (
        <p className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
          Voice deleted.
        </p>
      ) : null}
      {sp.style_example_deleted === "1" ? (
        <p className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
          Style example removed. It will not be re-imported from RSS.
        </p>
      ) : null}
      {activeVoice ? (
        <PersonaGenerationIndicator
          voiceId={activeVoice.id}
          initialStatus={activeVoice.persona_status}
          initialError={formatPersonaErrorForDisplay(activeVoice.persona_error)}
          startPolling={activePersonaPolling}
          voiceIdParam={activeVoice.id}
          generatingParam={sp.generating}
          personaRequestedAtIso={activeVoice.persona_requested_at?.toISOString()}
          initialStale={activePersonaStale}
        />
      ) : null}
      {errorMsg ? (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </p>
      ) : null}

      <section className="ui-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Your voices</h2>
          <Link
            href="/voices"
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            New voice
          </Link>
        </div>
        {voices.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No voices yet. Create one below.</p>
        ) : (
          <ul className="space-y-2">
            {voices.map((v) => {
              const inProgress = shouldPollPersona(v, v.id === selectedId ? sp.generating : undefined);
              return (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2"
              >
                <div>
                  <Link
                    href={`/voices?voice_id=${v.id}`}
                    className="font-medium hover:text-[var(--primary)] hover:underline"
                  >
                    {v.name}
                  </Link>
                  <p className="text-xs text-[var(--muted)]">
                    {personaStatusLabel(v.persona_status, inProgress && v.persona_status === "pending")}
                    {v.content_signal_ids.length
                      ? ` · ${v.content_signal_ids.length} signal(s)`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/voices?voice_id=${v.id}`}
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Edit
                </Link>
              </li>
            );
            })}
          </ul>
        )}
      </section>

      <section className="ui-card p-4">
        <h2 className="mb-4 text-lg font-medium">
          {activeVoice ? `Edit: ${activeVoice.name}` : "Create voice"}
        </h2>
        <form
          key={`${activeVoice?.id ?? "new-voice"}-${activeVoice?.persona_generated_at?.getTime() ?? 0}-${activeVoice?.persona_status ?? "pending"}`}
          action={saveVoiceAction}
          className="space-y-4"
        >
          {activeVoice ? (
            <input type="hidden" name="voice_id" value={activeVoice.id} />
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              name="name"
              required
              defaultValue={activeVoice?.name ?? ""}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
              placeholder="Brand voice name"
            />
          </label>

          <BrandMentionSlider defaultValue={activeVoice?.brand_mention_level ?? 50} />

          <SourcesInPostsSlider defaultValue={activeVoice?.sources_in_posts_level ?? 0} />

          <label className="flex flex-col gap-1 text-sm">
            Website URL
            <input
              name="website_url"
              type="url"
              defaultValue={activeVoice?.website_url ?? ""}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
              placeholder="https://example.com"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            RSS feed URL
            <input
              name="rss_feed_url"
              type="url"
              defaultValue={activeVoice?.rss_feed_url ?? ""}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
              placeholder="https://example.com/feed.xml"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Social profile links
            <span className="text-xs text-[var(--muted)]">
              One URL per line. Optional label: Platform|https://…
            </span>
            <textarea
              name="social_links"
              rows={4}
              defaultValue={activeVoice ? socialLinksToText(activeVoice.social_links) : ""}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
              placeholder="https://twitter.com/brand"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="voice-keywords" tip={VOICE_FIELD_TIPS.keywords}>
              Keywords (up to 5)
            </LabelWithTip>
            <span className="text-xs text-[var(--muted)]">
              One per line or comma-separated. Shapes persona and Writer style — not Writer research.
            </span>
            <textarea
              id="voice-keywords"
              name="keywords"
              rows={2}
              defaultValue={activeVoice?.keywords.join("\n") ?? ""}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
              placeholder={"playful\nurgent\ntrusted"}
            />
          </label>

          <DistributionPlatformsEditor
            defaultPlatforms={activeVoice?.distribution_platforms ?? []}
          />

          <div className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="voice-preferred-phrases" tip={VOICE_FIELD_TIPS.preferred_phrases}>
              Preferred phrases for posts
            </LabelWithTip>
            <span className="text-xs text-[var(--muted)]">
              Each phrase has its own frequency slider. At most one phrase is used per generated post; higher frequency phrases are preferred.
            </span>
            <PreferredPhrasesEditor defaultPhrases={activeVoice?.preferred_phrases ?? []} />
          </div>

          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Linked content signals</legend>
            <p className="text-xs text-[var(--muted)]">
              Routes Feed emails to Posts for this voice. Does not train persona or Writer style examples.
            </p>
            {contentSignals.length === 0 ? (
              <p className="text-[var(--muted)]">
                No content signals yet.{" "}
                <Link href="/content-signals" className="text-[var(--primary)] hover:underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {contentSignals.map((cs) => (
                  <label key={cs.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="content_signal_ids"
                      value={cs.id}
                      defaultChecked={activeVoice?.content_signal_ids.includes(cs.id)}
                    />
                    {cs.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="voice-persona" tip={VOICE_FIELD_TIPS.persona}>
              Persona template
            </LabelWithTip>
            <span className="text-xs text-[var(--muted)]">
              Writer and editorial voice from your website, RSS articles, social links, and keywords. Social post sliders below control Posts separately. Editable after generation. Generation usually takes 1–3 minutes.
            </span>
            <textarea
              id="voice-persona"
              name="persona"
              rows={12}
              defaultValue={activeVoice?.persona ?? ""}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 font-mono text-sm text-[var(--fg)]"
              placeholder={
                activeVoice?.persona_status === "ready"
                  ? ""
                  : "Generate a persona to populate this field…"
              }
            />
            {activeVoice?.persona_status === "failed" && activeVoice.persona_error ? (
              <span className="text-xs text-red-600">
                {formatPersonaErrorForDisplay(activeVoice.persona_error)}
              </span>
            ) : null}
            {activeVoice?.persona_generated_at ? (
              <LocalDateTime iso={activeVoice.persona_generated_at.toISOString()} />
            ) : null}
          </label>

          {activeVoice ? (
            <VoiceStyleExamplesEditor
              voiceId={activeVoice.id}
              rssFeedUrl={activeVoice.rss_feed_url}
              examples={styleExamples}
              workerConfigured={workerConfigured}
              syncSummary={activeVoice.style_examples_sync_summary}
              syncError={activeVoice.style_examples_sync_error}
              syncSyncedAt={activeVoice.style_examples_synced_at?.toISOString()}
              syncIndicator={
                <StyleExamplesSyncIndicator
                  voiceId={activeVoice.id}
                  startPolling={activeStyleSyncPolling}
                  initialExampleCount={styleExamples.length}
                  voiceIdParam={activeVoice.id}
                />
              }
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Save voice
            </button>
            {activeVoice ? (
              <>
                <button
                  formAction={generateVoicePersonaAction}
                  type="submit"
                  disabled={
                    !workerConfigured ||
                    (activePersonaPolling && activeVoice.persona_status === "pending")
                  }
                  data-persona-generate
                  className="rounded border border-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary)] hover:bg-surface disabled:opacity-50"
                >
                  {activeVoice.persona_status === "ready" ? "Regenerate persona" : "Generate persona"}
                </button>
                {(activeVoice.persona_status === "failed" || activePersonaStale) &&
                activeVoice.persona_status !== "ready" ? (
                  <button
                    formAction={retryVoicePersonaAction}
                    type="submit"
                    disabled={!workerConfigured}
                    data-persona-generate
                    className="rounded border border-amber-500/50 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    Retry persona
                  </button>
                ) : null}
                <button
                  formAction={deleteVoiceAction}
                  type="submit"
                  className="rounded border border-red-400 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
          {!workerConfigured ? (
            <p className="text-xs text-[var(--muted)]">
              Set <code className="text-[var(--fg)]">WORKER_URL</code> on Vercel to enable persona
              generation.
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
