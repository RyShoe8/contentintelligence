"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  createVoiceAction,
  createTopicAction,
  generateVoicePersonaForLaunchAction,
} from "@/app/launch/actions";

// ── Step Indicator ─────────────────────────────────────────────
function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { n: 1, label: "Your Voice" },
    { n: 2, label: "Your Topic" },
    { n: 3, label: "First Feed" },
    { n: 4, label: "Content Pack" },
  ];

  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, i) => (
        <div key={step.n} className="flex items-center">
          {/* Circle */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all ${
                step.n < currentStep
                  ? "bg-[var(--success)] text-white"
                  : step.n === currentStep
                    ? "text-white"
                    : "bg-[var(--surface-raised)] text-[var(--muted)]"
              }`}
              style={
                step.n === currentStep
                  ? { background: "linear-gradient(135deg, var(--primary), #7c3aed)" }
                  : {}
              }
            >
              {step.n < currentStep ? "✓" : step.n}
            </div>
            <span
              className={`text-[10px] font-medium whitespace-nowrap ${
                step.n === currentStep ? "text-[var(--primary)]" : "text-[var(--muted)]"
              }`}
            >
              {step.label}
            </span>
          </div>
          {/* Connector */}
          {i < steps.length - 1 && (
            <div
              className={`mx-2 mb-5 h-0.5 w-16 transition-all ${
                step.n < currentStep ? "bg-[var(--success)]" : "bg-[var(--border)]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Voice ─────────────────────────────────────────────
function StepVoice({
  voiceId,
  error,
  isGenerating,
  workerConfigured,
}: {
  voiceId: string | null;
  error: string | null;
  isGenerating: boolean;
  workerConfigured: boolean;
}) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-[var(--fg)]">Set up your brand voice</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your voice shapes how all content is written. We&apos;ll generate an AI persona from your
          website and social presence.
        </p>
      </div>

      {error === "voice_name" && (
        <p className="ui-alert-error text-sm">Please enter a voice name.</p>
      )}
      {error === "worker_failed" && (
        <p className="ui-alert-warning text-sm">
          Persona generation is unavailable right now. You can skip this and generate it later.
        </p>
      )}

      <form action={createVoiceAction} className="space-y-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--fg-secondary)]">Voice name *</span>
          <input
            name="name"
            required
            className="ui-input"
            placeholder="e.g. My Brand, CasinoReviews Pro…"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--fg-secondary)]">Your website URL</span>
          <span className="text-xs text-[var(--muted)]">
            Used to generate your AI persona — the more we can read, the better.
          </span>
          <input name="website_url" type="url" className="ui-input" placeholder="https://yourbrand.com" />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--fg-secondary)]">RSS feed URL (optional)</span>
          <input name="rss_feed_url" type="url" className="ui-input" placeholder="https://yourbrand.com/feed.xml" />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--fg-secondary)]">Keywords (up to 5)</span>
          <span className="text-xs text-[var(--muted)]">Comma or line separated — shapes your writing tone.</span>
          <textarea
            name="keywords"
            rows={2}
            className="ui-textarea"
            placeholder="e.g. casino, bonuses, trusted, expert…"
          />
        </label>

        <button type="submit" className="ui-btn-primary w-full justify-center py-2.5">
          Create voice & continue →
        </button>
      </form>

      {/* If voice already created, show generate persona */}
      {voiceId && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm font-medium text-[var(--fg)]">Voice created!</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {isGenerating
              ? "Generating your AI persona… this usually takes 1–3 minutes."
              : "Optionally generate an AI persona now, or skip to the next step."}
          </p>
          {isGenerating ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-[var(--warning)]">
              <span className="animate-spin">⚙️</span> Generating persona…
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              {workerConfigured && (
                <form action={generateVoicePersonaForLaunchAction}>
                  <input type="hidden" name="voice_id" value={voiceId} />
                  <button type="submit" className="ui-btn-secondary text-xs">
                    Generate persona (optional)
                  </button>
                </form>
              )}
              <Link href={`/launch?step=2&voice_id=${voiceId}`} className="ui-btn-primary text-xs">
                Skip to topic →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Topic ─────────────────────────────────────────────
function StepTopic({ voiceId, error }: { voiceId: string | null; error: string | null }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-[var(--fg)]">Define your first topic</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Topics tell the system what content to track. Add website URLs or Gmail as sources after
          creation.
        </p>
      </div>

      {error === "topic_name" && (
        <p className="ui-alert-error text-sm">Please enter a topic name.</p>
      )}

      <form action={createTopicAction} className="space-y-4">
        {voiceId && <input type="hidden" name="voice_id" value={voiceId} />}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--fg-secondary)]">Topic name *</span>
          <input
            name="name"
            required
            className="ui-input"
            placeholder="e.g. Casino Bonuses, Sports Betting News…"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--fg-secondary)]">Description</span>
          <span className="text-xs text-[var(--muted)]">
            What kind of content does this topic track? This helps the AI filter relevance.
          </span>
          <textarea
            name="description"
            rows={3}
            className="ui-textarea"
            placeholder="e.g. Online casino promotions, welcome bonuses, and free spin offers from licensed operators…"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--fg-secondary)]">Keywords</span>
          <span className="text-xs text-[var(--muted)]">Used to filter and score content relevance.</span>
          <textarea
            name="keywords"
            rows={2}
            className="ui-textarea"
            placeholder="One per line or comma-separated"
          />
        </label>

        <button type="submit" className="ui-btn-primary w-full justify-center py-2.5">
          Create topic & continue →
        </button>
      </form>
    </div>
  );
}

// ── Step 3: Feed ──────────────────────────────────────────────
function StepFeed({ topicId, voiceId }: { topicId: string | null; voiceId: string | null }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-[var(--fg)]">Connect your sources</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Add website URLs or Gmail as content sources for your topic, then run your first feed.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--accent-dim)] bg-[var(--accent-dim)] p-4">
        <p className="text-sm font-semibold text-[var(--accent)]">Topic created! 🎉</p>
        <p className="mt-1 text-xs text-[var(--fg-secondary)]">
          Now add some content sources to your topic so the feed has somewhere to pull from.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={topicId ? `/topics/${topicId}?source_type=website` : "/topics"}
          className="ui-card-hover flex flex-col gap-2 p-4"
        >
          <span className="text-2xl">🌐</span>
          <p className="font-semibold text-[var(--fg)]">Website URLs</p>
          <p className="text-xs text-[var(--muted)]">
            Add up to 25 URLs. We auto-discover RSS feeds and scrape articles.
          </p>
          <span className="mt-auto text-xs font-medium text-[var(--primary)]">Add URLs →</span>
        </Link>

        <Link
          href={topicId ? `/topics/${topicId}?source_type=gmail` : "/topics"}
          className="ui-card-hover flex flex-col gap-2 p-4"
        >
          <span className="text-2xl">✉️</span>
          <p className="font-semibold text-[var(--fg)]">Gmail Inbox</p>
          <p className="text-xs text-[var(--muted)]">
            Connect a Gmail inbox with label and sender filters for email newsletters.
          </p>
          <span className="mt-auto text-xs font-medium text-[var(--primary)]">Connect Gmail →</span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs text-[var(--muted)]">or</span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <div className="text-center">
        <Link
          href={topicId && voiceId ? `/launch?step=4&topic_id=${topicId}&voice_id=${voiceId}` : "/dashboard"}
          className="text-sm text-[var(--muted)] hover:text-[var(--fg)] underline"
        >
          Skip for now, go to dashboard →
        </Link>
      </div>
    </div>
  );
}

// ── Step 4: Content Pack ──────────────────────────────────────
function StepContent({ topicId, voiceId }: { topicId: string | null; voiceId: string | null }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-[var(--fg)]">Generate your content</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Once your feed has items, generate social drafts and your first article.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={topicId ? `/posts?content_signal_id=${topicId}` : "/posts"}
          className="ui-card-hover flex flex-col gap-3 p-5"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary-dim)] text-lg">
              💬
            </span>
            <h3 className="font-semibold text-[var(--fg)]">Social Drafts</h3>
          </div>
          <p className="text-xs text-[var(--muted)]">
            View AI-generated social posts from your feed items, ready to copy and post.
          </p>
          <span className="mt-auto text-xs font-medium text-[var(--primary)]">View Social Drafts →</span>
        </Link>

        <Link
          href="/studio?tab=compose"
          className="ui-card-hover flex flex-col gap-3 p-5"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-dim)] text-lg">
              ✍️
            </span>
            <h3 className="font-semibold text-[var(--fg)]">Article Studio</h3>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Write a full researched article on your topic using AI.
          </p>
          <span className="mt-auto text-xs font-medium text-[var(--accent)]">Open Article Studio →</span>
        </Link>
      </div>

      <div className="text-center pt-2">
        <Link
          href="/dashboard"
          className="ui-btn-primary inline-flex"
        >
          Go to Dashboard 🚀
        </Link>
      </div>
    </div>
  );
}

// ── Main Wizard Shell ─────────────────────────────────────────
type Props = {
  workerConfigured: boolean;
  initialStep: number;
  initialVoice: { id: string; name: string; personaStatus: string } | null;
  initialTopic: { id: string; name: string } | null;
};

function WizardInner({ workerConfigured, initialStep, initialVoice, initialTopic }: Props) {
  const searchParams = useSearchParams();

  const step = Number(searchParams.get("step") ?? initialStep);
  const voiceId = searchParams.get("voice_id") ?? initialVoice?.id ?? null;
  const topicId = searchParams.get("topic_id") ?? initialTopic?.id ?? null;
  const error = searchParams.get("error") ?? null;
  const isGenerating = searchParams.get("generating") === "1";

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
          Launch Wizard
        </p>
        <h1 className="mt-1 text-3xl font-bold gradient-text">
          Let&apos;s build your content engine
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          A quick setup to get you generating content in minutes.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <StepIndicator currentStep={step} />
      </div>

      {/* Step content card */}
      <div className="ui-glass p-6 md:p-8">
        {step === 1 && (
          <StepVoice
            voiceId={voiceId}
            error={error}
            isGenerating={isGenerating}
            workerConfigured={workerConfigured}
          />
        )}
        {step === 2 && <StepTopic voiceId={voiceId} error={error} />}
        {step === 3 && <StepFeed topicId={topicId} voiceId={voiceId} />}
        {step === 4 && <StepContent topicId={topicId} voiceId={voiceId} />}
      </div>

      {/* Skip link */}
      {step < 4 && (
        <div className="mt-4 text-center">
          <Link href="/dashboard" className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">
            Skip setup and go to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}

export function LaunchWizard(props: Props) {
  return (
    <Suspense fallback={<div className="text-center text-sm text-[var(--muted)]">Loading…</div>}>
      <WizardInner {...props} />
    </Suspense>
  );
}
