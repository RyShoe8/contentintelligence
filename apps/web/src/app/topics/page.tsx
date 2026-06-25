import Link from "next/link";
import {
  ensureIndexes,
  listContentSignalTemplates,
  listContentSignals,
  listSourcesByContentSignal,
} from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import {
  deleteContentSignalAction,
  saveContentSignalAction,
  toggleContentSignalAction,
} from "../content-signals/actions";
import {
  createSignalFromTemplateAction,
  deleteTemplateAction,
  saveTemplateAction,
  saveTemplateFromSignalAction,
} from "../content-signals/template-actions";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { LabelWithTip } from "../signals/label-with-tip";
import { CONTENT_SIGNAL_FIELD_TIPS } from "../content-signals/field-help";
import {
  TEMPLATE_SCHEDULE_OPTIONS,
  templateScheduleLabel,
} from "../content-signals/template-constants";

export const dynamic = "force-dynamic";

function statusBanner(sp: {
  template_saved?: string;
  template_deleted?: string;
  error?: string;
}) {
  if (sp.template_saved === "1")
    return <Alert variant="success">Template saved.</Alert>;
  if (sp.template_deleted === "1")
    return <Alert variant="info">Template deleted.</Alert>;
  if (sp.error === "template_name")
    return <Alert variant="error">Enter a template name.</Alert>;
  if (sp.error === "signal_name")
    return <Alert variant="error">Enter a name for the new topic.</Alert>;
  if (sp.error === "template_not_found")
    return <Alert variant="error">Template not found.</Alert>;
  if (sp.error === "not_found")
    return <Alert variant="error">Topic not found.</Alert>;
  if (sp.error === "name")
    return <Alert variant="error">Enter a topic name.</Alert>;
  return null;
}

function templateFieldsForm(
  prefix: string,
  defaults?: {
    name?: string;
    description?: string;
    keywords?: string[];
    lookback_window_hours?: number;
    deal_unit_tokens?: string[];
    active?: boolean;
    post_min_deal_pct?: number;
    ingest_interval_minutes?: number | null;
  },
) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <LabelWithTip
          htmlFor={`${prefix}-name`}
          tip={CONTENT_SIGNAL_FIELD_TIPS.template_name}
        >
          Template name
        </LabelWithTip>
        <input
          id={`${prefix}-name`}
          name="name"
          required
          defaultValue={defaults?.name ?? ""}
          className="ui-input"
          placeholder="Casinos starter"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <LabelWithTip
          htmlFor={`${prefix}-description`}
          tip={CONTENT_SIGNAL_FIELD_TIPS.description}
        >
          Description
        </LabelWithTip>
        <textarea
          id={`${prefix}-description`}
          name="description"
          rows={2}
          defaultValue={defaults?.description ?? ""}
          className="ui-textarea"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <LabelWithTip
          htmlFor={`${prefix}-keywords`}
          tip={CONTENT_SIGNAL_FIELD_TIPS.keywords}
        >
          Keywords
        </LabelWithTip>
        <textarea
          id={`${prefix}-keywords`}
          name="keywords"
          rows={3}
          defaultValue={defaults?.keywords?.join("\n") ?? ""}
          className="ui-textarea"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <LabelWithTip
          htmlFor={`${prefix}-lookback`}
          tip={CONTENT_SIGNAL_FIELD_TIPS.lookback_window_hours}
        >
          Lookback window (hours)
        </LabelWithTip>
        <input
          id={`${prefix}-lookback`}
          name="lookback_window_hours"
          type="number"
          min={1}
          max={2160}
          defaultValue={defaults?.lookback_window_hours ?? 168}
          className="ui-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <LabelWithTip
          htmlFor={`${prefix}-deal`}
          tip={CONTENT_SIGNAL_FIELD_TIPS.deal_unit_tokens}
        >
          Deal unit tokens
        </LabelWithTip>
        <textarea
          id={`${prefix}-deal`}
          name="deal_unit_tokens"
          rows={2}
          defaultValue={defaults?.deal_unit_tokens?.join("\n") ?? ""}
          className="ui-textarea"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">
          Min deal strength for auto posts (%)
        </span>
        <input
          name="post_min_deal_pct"
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={defaults?.post_min_deal_pct ?? 50}
          className="ui-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">
          Feed sync schedule (default for new topics)
        </span>
        <select
          name="ingest_interval_minutes"
          defaultValue={
            defaults?.ingest_interval_minutes == null
              ? ""
              : String(defaults.ingest_interval_minutes)
          }
          className="ui-select"
        >
          <option value="">Off</option>
          {TEMPLATE_SCHEDULE_OPTIONS.filter((m) => m != null).map((m) => (
            <option key={m} value={m}>
              {templateScheduleLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={defaults?.active ?? true}
          className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
        />
        <span className="text-[var(--fg)]">Active by default</span>
      </label>
    </>
  );
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{
    template_saved?: string;
    template_deleted?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await requireOrgMember();
  const db = await connectMongo();
  await ensureIndexes(db);
  const [signals, templates] = await Promise.all([
    listContentSignals(db, { organizationId: session.user.organizationId }),
    listContentSignalTemplates(db, session.user.organizationId),
  ]);
  const sourceCounts = await Promise.all(
    signals.map(async (s) => ({
      id: s.id,
      count: (await listSourcesByContentSignal(db, s.id)).length,
    })),
  );
  const countById = Object.fromEntries(
    sourceCounts.map((x) => [x.id, x.count]),
  );

  return (
    <div className="animate-fade-in space-y-10">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Topics"
          description="Track the topics that matter to your content strategy. Add keyword filters and connect Gmail or website sources to each topic."
        />
        <a
          href="#new-topic"
          className="ui-btn-primary shrink-0 self-start px-5 py-2.5 text-sm font-semibold"
        >
          + New Topic
        </a>
      </div>

      {statusBanner(sp)}

      {/* Topic Grid */}
      {signals.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-[var(--fg)]">
            Your Topics
            <span className="ml-2 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-normal text-[var(--muted)]">
              {signals.length}
            </span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {signals.map((cs) => {
              const sourceCount = countById[cs.id] ?? 0;
              const keywordsPreview = cs.keywords.slice(0, 5);
              return (
                <div
                  key={cs.id}
                  className="group relative flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all duration-200 hover:border-[var(--primary)]/50 hover:shadow-lg hover:shadow-[var(--primary)]/5"
                >
                  {/* Status badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${cs.active ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-[var(--muted)]"}`}
                      />
                      <h3 className="font-semibold text-[var(--fg)] group-hover:text-[var(--primary)] transition-colors">
                        <Link href={`/content-signals/${cs.id}`}>
                          {cs.name}
                        </Link>
                      </h3>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cs.active ? "bg-emerald-500/10 text-emerald-400" : "bg-[var(--surface-raised)] text-[var(--muted)]"}`}
                    >
                      {cs.active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Description */}
                  {cs.description && (
                    <p className="text-sm text-[var(--fg-secondary)] line-clamp-2">
                      {cs.description}
                    </p>
                  )}

                  {/* Keywords */}
                  {keywordsPreview.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {keywordsPreview.map((kw) => (
                        <span
                          key={kw}
                          className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--fg-secondary)]"
                        >
                          {kw}
                        </span>
                      ))}
                      {cs.keywords.length > 5 && (
                        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--muted)]">
                          +{cs.keywords.length - 5} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                    <span className="flex items-center gap-1">
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                        <polyline points="13 2 13 9 20 9" />
                      </svg>
                      {sourceCount} source{sourceCount !== 1 ? "s" : ""}
                    </span>
                    <span>·</span>
                    <span>{cs.lookback_window_hours}h lookback</span>
                  </div>

                  {/* Actions row */}
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                    <Link
                      href={`/content-signals/${cs.id}`}
                      className="ui-btn-secondary flex-1 px-3 py-1.5 text-center text-xs font-medium"
                    >
                      Manage sources
                    </Link>
                    <form action={toggleContentSignalAction}>
                      <input type="hidden" name="id" value={cs.id} />
                      <button
                        type="submit"
                        className="ui-btn-ghost px-3 py-1.5 text-xs font-medium"
                      >
                        {cs.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                    <form action={deleteContentSignalAction}>
                      <input type="hidden" name="id" value={cs.id} />
                      <button
                        type="submit"
                        className="ui-btn-danger px-3 py-1.5 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </form>
                  </div>

                  {/* Save as template */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-[var(--accent)] hover:underline">
                      Save as template
                    </summary>
                    <form
                      action={saveTemplateFromSignalAction}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <input
                        type="hidden"
                        name="content_signal_id"
                        value={cs.id}
                      />
                      <input type="hidden" name="return_to" value="/topics" />
                      <input
                        name="template_name"
                        placeholder={`${cs.name} template`}
                        className="ui-input flex-1 py-1.5 text-xs"
                      />
                      <button
                        type="submit"
                        className="ui-btn-secondary px-3 py-1.5 text-xs"
                      >
                        Save
                      </button>
                    </form>
                  </details>

                  {/* Edit settings */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-[var(--accent)] hover:underline">
                      Edit settings
                    </summary>
                    <form
                      action={saveContentSignalAction}
                      className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3"
                    >
                      <input type="hidden" name="id" value={cs.id} />
                      <label className="flex flex-col gap-1">
                        <span className="text-[var(--muted)]">Name</span>
                        <input
                          name="name"
                          defaultValue={cs.name}
                          className="ui-input py-1.5"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[var(--muted)]">Description</span>
                        <textarea
                          name="description"
                          defaultValue={cs.description}
                          rows={2}
                          className="ui-textarea"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[var(--muted)]">Keywords</span>
                        <textarea
                          name="keywords"
                          defaultValue={cs.keywords.join("\n")}
                          rows={3}
                          className="ui-textarea"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[var(--muted)]">
                          Lookback (hours)
                        </span>
                        <input
                          name="lookback_window_hours"
                          type="number"
                          min={1}
                          defaultValue={cs.lookback_window_hours}
                          className="ui-input py-1.5"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[var(--muted)]">
                          Deal unit tokens
                        </span>
                        <textarea
                          name="deal_unit_tokens"
                          defaultValue={cs.deal_unit_tokens.join("\n")}
                          rows={2}
                          className="ui-textarea"
                        />
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={cs.active}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        <span className="text-[var(--fg)]">Active</span>
                      </label>
                      <button
                        type="submit"
                        className="ui-btn-primary w-fit px-3 py-1.5 text-xs font-medium"
                      >
                        Update topic
                      </button>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {signals.length === 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10">
            <svg
              className="h-7 w-7 text-[var(--primary)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-semibold text-[var(--fg)]">
            No topics yet
          </h3>
          <p className="mb-6 text-sm text-[var(--muted)]">
            Create your first topic to start tracking content signals.
          </p>
          <a href="#new-topic" className="ui-btn-primary px-5 py-2.5 text-sm">
            + New Topic
          </a>
        </div>
      )}

      {/* New Topic Form */}
      <section id="new-topic" className="ui-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-[var(--fg)]">
          New Topic
        </h2>
        <p className="mb-5 text-sm text-[var(--muted)]">
          Define keywords, lookback window, and deal parsing for a new topic.
        </p>
        <form action={saveContentSignalAction} className="grid gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="cs-add-name" tip={CONTENT_SIGNAL_FIELD_TIPS.name}>
              Name
            </LabelWithTip>
            <input
              id="cs-add-name"
              name="name"
              required
              className="ui-input"
              placeholder="Gambling"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip
              htmlFor="cs-add-description"
              tip={CONTENT_SIGNAL_FIELD_TIPS.description}
            >
              Description
            </LabelWithTip>
            <textarea
              id="cs-add-description"
              name="description"
              rows={2}
              className="ui-textarea"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip
              htmlFor="cs-add-keywords"
              tip={CONTENT_SIGNAL_FIELD_TIPS.keywords}
            >
              Keywords
            </LabelWithTip>
            <textarea
              id="cs-add-keywords"
              name="keywords"
              rows={3}
              className="ui-textarea"
              placeholder="bonus, free spins, promo"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip
              htmlFor="cs-add-lookback"
              tip={CONTENT_SIGNAL_FIELD_TIPS.lookback_window_hours}
            >
              Lookback window (hours)
            </LabelWithTip>
            <input
              id="cs-add-lookback"
              name="lookback_window_hours"
              type="number"
              min={1}
              max={2160}
              defaultValue={168}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip
              htmlFor="cs-add-deal"
              tip={CONTENT_SIGNAL_FIELD_TIPS.deal_unit_tokens}
            >
              Deal unit tokens
            </LabelWithTip>
            <textarea
              id="cs-add-deal"
              name="deal_unit_tokens"
              rows={2}
              className="ui-textarea"
              placeholder="SC, FP, $"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span className="text-[var(--fg)]">Active</span>
          </label>
          <button
            type="submit"
            className="ui-btn-primary w-fit px-5 py-2.5 text-sm font-semibold"
          >
            Save Topic
          </button>
        </form>
      </section>

      {/* Templates Section */}
      <section className="ui-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-[var(--fg)]">
          Templates
        </h2>
        <p className="mb-5 text-sm text-[var(--muted)]">
          {CONTENT_SIGNAL_FIELD_TIPS.templates}
        </p>

        {templates.length === 0 ? (
          <p className="mb-4 text-sm text-[var(--muted)]">
            No templates yet. Save one from an existing topic above.
          </p>
        ) : (
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-[var(--fg)]">{t.name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {t.description || "—"}
                    </p>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Keywords: {t.keywords.join(", ") || "—"} · Lookback:{" "}
                      {t.lookback_window_hours}h · Posts min:{" "}
                      {t.post_min_deal_pct}%
                    </p>
                  </div>
                  <form
                    action={createSignalFromTemplateAction}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="template_id" value={t.id} />
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-[var(--muted)]">
                        New topic name
                      </span>
                      <input
                        name="signal_name"
                        required
                        placeholder={t.name}
                        className="ui-input py-1.5 text-sm"
                      />
                    </label>
                    <button
                      type="submit"
                      className="ui-btn-primary px-3 py-2 text-sm font-medium"
                    >
                      Create topic
                    </button>
                  </form>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-[var(--accent)] hover:underline">
                    Edit template
                  </summary>
                  <form
                    action={saveTemplateAction}
                    className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3"
                  >
                    <input type="hidden" name="id" value={t.id} />
                    {templateFieldsForm(`tpl-${t.id}`, t)}
                    <button
                      type="submit"
                      className="ui-btn-secondary w-fit px-3 py-1.5 text-sm"
                    >
                      Update template
                    </button>
                  </form>
                </details>
                <form action={deleteTemplateAction} className="mt-2">
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    type="submit"
                    className="text-sm text-red-400 hover:underline"
                  >
                    Delete template
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <details>
          <summary className="cursor-pointer text-sm font-medium text-[var(--accent)] hover:underline">
            Add template manually
          </summary>
          <form action={saveTemplateAction} className="mt-4 grid gap-4">
            {templateFieldsForm("new-template")}
            <button
              type="submit"
              className="ui-btn-primary w-fit px-5 py-2 text-sm font-medium"
            >
              Save template
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
