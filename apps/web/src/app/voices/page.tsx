import Link from "next/link";
import {
  ensureIndexes,
  listContentSignals,
  listVoices,
  getVoice,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import {
  deleteVoiceAction,
  generateVoicePersonaAction,
  saveVoiceAction,
} from "./actions";
import { BrandMentionSlider } from "./brand-mention-slider";
import { PersonaGenerationIndicator } from "./persona-generation-indicator";
import { PersonaGeneratedAt } from "./persona-generated-at";
import { VOICE_FIELD_TIPS } from "./field-help";
import { LabelWithTip } from "../signals/label-with-tip";

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

function shouldPollPersona(
  voice: {
    persona_status: string;
    persona?: string;
    persona_generated_at?: Date;
  },
  generatingParam?: string,
): boolean {
  return (
    generatingParam === "1" ||
    (voice.persona_status === "pending" &&
      (voice.persona_generated_at != null || Boolean(voice.persona?.trim())))
  );
}

function preferredPhrasesToText(phrases: { phrase: string; url?: string }[]): string {
  return phrases
    .map((p) => (p.url ? `${p.phrase}|${p.url}` : p.phrase))
    .join("\n");
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
  const activeVoice =
    editing && editing.organization_id === orgId ? editing : null;
  const workerConfigured = !!process.env.WORKER_URL;
  const activePersonaPolling = activeVoice ? shouldPollPersona(activeVoice, sp.generating) : false;

  const errorMsg =
    sp.error === "name"
      ? "Enter a voice name."
      : sp.error === "not_found"
        ? "Voice not found."
        : sp.error === "generate_failed"
          ? (() => {
              const detail = decodeErrorDetail(sp.error_detail);
              return detail
                ? `Could not start persona generation: ${detail}`
                : "Could not start persona generation. Check worker configuration.";
            })()
          : sp.error === "missing_voice"
            ? "Select a voice to generate."
            : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Voices</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Define brand voices from your website, RSS, and social profiles. Link a voice to content
          signals to shape post copy on the Posts page.
        </p>
      </div>

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
      {activeVoice ? (
        <PersonaGenerationIndicator
          voiceId={activeVoice.id}
          initialStatus={activeVoice.persona_status}
          initialError={activeVoice.persona_error}
          startPolling={activePersonaPolling}
          voiceIdParam={activeVoice.id}
          generatingParam={sp.generating}
        />
      ) : null}
      {errorMsg ? (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </p>
      ) : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
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

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
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
              One per line or comma-separated.
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

          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="voice-preferred-phrases" tip={VOICE_FIELD_TIPS.preferred_phrases}>
              Preferred phrases for posts
            </LabelWithTip>
            <span className="text-xs text-[var(--muted)]">
              One per line: Your phrase|https://optional-link.com. Link is optional. Used sometimes in generated post copy, not every time.
            </span>
            <textarea
              id="voice-preferred-phrases"
              name="preferred_phrases"
              rows={3}
              defaultValue={activeVoice ? preferredPhrasesToText(activeVoice.preferred_phrases) : ""}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
              placeholder={"Grab it while it lasts|https://example.com/promo\nYour daily bonus drop"}
            />
          </label>

          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Linked content signals</legend>
            <p className="text-xs text-[var(--muted)]">
              One voice can drive post copy for multiple content signals.
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
            Persona template
            <span className="text-xs text-[var(--muted)]">
              Generated by AI from your sources, then editable. Includes brand mention frequency and preferred phrases. Also used when building Posts. Generation usually takes 1–3 minutes.
            </span>
            <textarea
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
              <span className="text-xs text-red-600">{activeVoice.persona_error}</span>
            ) : null}
            {activeVoice?.persona_generated_at ? (
              <PersonaGeneratedAt iso={activeVoice.persona_generated_at.toISOString()} />
            ) : null}
          </label>

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
                  disabled={!workerConfigured || (activePersonaPolling && activeVoice.persona_status === "pending")}
                  data-persona-generate
                  className="rounded border border-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary)] hover:bg-surface disabled:opacity-50"
                >
                  {activeVoice.persona_status === "ready" ? "Regenerate persona" : "Generate persona"}
                </button>
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
