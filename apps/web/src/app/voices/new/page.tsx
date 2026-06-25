import Link from "next/link";
import { listContentSignals, ensureIndexes } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import { saveVoiceAction } from "../actions";
import { BrandMentionSlider } from "../brand-mention-slider";
import { SourcesInPostsSlider } from "../sources-in-posts-slider";
import { DistributionPlatformsEditor } from "../distribution-platforms-editor";
import { PreferredPhrasesEditor } from "../preferred-phrases-editor";
import { VOICE_FIELD_TIPS } from "../field-help";
import { LabelWithTip } from "../../signals/label-with-tip";

export const dynamic = "force-dynamic";

export default async function NewVoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireOrgMember();
  const orgId = session.user.organizationId;
  const db = await connectMongo();
  await ensureIndexes(db);

  const contentSignals = await listContentSignals(db, { organizationId: orgId });

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
      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">New Voice</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create a new brand voice to shape how content is written and styled.
        </p>
      </div>

      {sp.error === "name" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Enter a voice name.
        </div>
      )}

      {/* Form */}
      <div className="ui-card p-6">
        <form action={saveVoiceAction} className="space-y-6">
          {/* No voice_id = create new */}

          {/* Name */}
          <div className="space-y-1">
            <label
              htmlFor="new-voice-name"
              className="text-sm text-[var(--muted)]"
            >
              Voice Name
            </label>
            <input
              id="new-voice-name"
              name="name"
              required
              className="ui-input"
              placeholder="Brand voice name"
            />
          </div>

          {/* Sliders */}
          <div className="grid gap-4 sm:grid-cols-2">
            <BrandMentionSlider defaultValue={50} />
            <SourcesInPostsSlider defaultValue={0} />
          </div>

          {/* URLs */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="new-voice-website"
                className="text-sm text-[var(--muted)]"
              >
                Website URL
              </label>
              <input
                id="new-voice-website"
                name="website_url"
                type="url"
                className="ui-input"
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="new-voice-rss"
                className="text-sm text-[var(--muted)]"
              >
                RSS Feed URL
              </label>
              <input
                id="new-voice-rss"
                name="rss_feed_url"
                type="url"
                className="ui-input"
                placeholder="https://example.com/feed.xml"
              />
            </div>
          </div>

          {/* Social links */}
          <div className="space-y-1">
            <label
              htmlFor="new-voice-social"
              className="text-sm text-[var(--muted)]"
            >
              Social profile links
            </label>
            <p className="text-xs text-[var(--muted)]">
              One URL per line. Optional label: Platform|https://…
            </p>
            <textarea
              id="new-voice-social"
              name="social_links"
              rows={4}
              className="ui-textarea"
              placeholder="https://twitter.com/brand"
            />
          </div>

          {/* Keywords */}
          <div className="space-y-1">
            <LabelWithTip
              htmlFor="new-voice-keywords"
              tip={VOICE_FIELD_TIPS.keywords}
            >
              Keywords (up to 5)
            </LabelWithTip>
            <p className="text-xs text-[var(--muted)]">
              One per line or comma-separated. Shapes persona and Writer style — not Writer research.
            </p>
            <textarea
              id="new-voice-keywords"
              name="keywords"
              rows={2}
              className="ui-textarea"
              placeholder={"playful\nurgent\ntrusted"}
            />
          </div>

          {/* Distribution platforms */}
          <DistributionPlatformsEditor defaultPlatforms={[]} />

          {/* Preferred phrases */}
          <div className="space-y-1">
            <LabelWithTip
              htmlFor="new-voice-preferred-phrases"
              tip={VOICE_FIELD_TIPS.preferred_phrases}
            >
              Preferred phrases for posts
            </LabelWithTip>
            <p className="text-xs text-[var(--muted)]">
              Each phrase has its own frequency slider. At most one phrase is used per generated post; higher frequency phrases are preferred.
            </p>
            <PreferredPhrasesEditor defaultPhrases={[]} />
          </div>

          {/* Linked content signals */}
          {contentSignals.length > 0 && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-[var(--fg)]">
                Linked Topics
              </legend>
              <p className="text-xs text-[var(--muted)]">
                Routes Feed emails to Posts for this voice. Does not train persona or Writer style examples.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {contentSignals.map((cs) => (
                  <label
                    key={cs.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="content_signal_ids"
                      value={cs.id}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <span className="text-[var(--fg)]">{cs.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Persona template */}
          <div className="space-y-1">
            <LabelWithTip
              htmlFor="new-voice-persona"
              tip={VOICE_FIELD_TIPS.persona}
            >
              Persona template
            </LabelWithTip>
            <p className="text-xs text-[var(--muted)]">
              Optionally seed a persona manually, or generate one after saving. Generation usually takes 1–3 minutes.
            </p>
            <textarea
              id="new-voice-persona"
              name="persona"
              rows={8}
              className="ui-textarea font-mono text-sm"
              placeholder="Generate a persona to populate this field…"
            />
          </div>

          {/* Submit */}
          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-4">
            <button
              type="submit"
              className="ui-btn-primary px-5 py-2.5 text-sm font-semibold"
            >
              Create Voice
            </button>
            <Link
              href="/voices"
              className="ui-btn-ghost px-5 py-2.5 text-sm font-medium"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
