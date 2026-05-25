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
} from "./actions";
import {
  createSignalFromTemplateAction,
  deleteTemplateAction,
  saveTemplateAction,
  saveTemplateFromSignalAction,
} from "./template-actions";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { LabelWithTip } from "../signals/label-with-tip";
import { CONTENT_SIGNAL_FIELD_TIPS } from "./field-help";
import { TEMPLATE_SCHEDULE_OPTIONS, templateScheduleLabel } from "./template-constants";

export const dynamic = "force-dynamic";

function statusBanner(sp: {
  template_saved?: string;
  template_deleted?: string;
  error?: string;
}) {
  if (sp.template_saved === "1") return <Alert variant="success">Template saved.</Alert>;
  if (sp.template_deleted === "1") return <Alert variant="info">Template deleted.</Alert>;
  if (sp.error === "template_name") return <Alert variant="error">Enter a template name.</Alert>;
  if (sp.error === "signal_name") return <Alert variant="error">Enter a name for the new content signal.</Alert>;
  if (sp.error === "template_not_found") return <Alert variant="error">Template not found.</Alert>;
  if (sp.error === "not_found") return <Alert variant="error">Content signal not found.</Alert>;
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
        <LabelWithTip htmlFor={`${prefix}-name`} tip={CONTENT_SIGNAL_FIELD_TIPS.template_name}>
          Template name
        </LabelWithTip>
        <input
          id={`${prefix}-name`}
          name="name"
          required
          defaultValue={defaults?.name ?? ""}
          className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
          placeholder="Casinos starter"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <LabelWithTip htmlFor={`${prefix}-description`} tip={CONTENT_SIGNAL_FIELD_TIPS.description}>
          Description
        </LabelWithTip>
        <textarea
          id={`${prefix}-description`}
          name="description"
          rows={2}
          defaultValue={defaults?.description ?? ""}
          className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <LabelWithTip htmlFor={`${prefix}-keywords`} tip={CONTENT_SIGNAL_FIELD_TIPS.keywords}>
          Keywords
        </LabelWithTip>
        <textarea
          id={`${prefix}-keywords`}
          name="keywords"
          rows={3}
          defaultValue={defaults?.keywords?.join("\n") ?? ""}
          className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <LabelWithTip htmlFor={`${prefix}-lookback`} tip={CONTENT_SIGNAL_FIELD_TIPS.lookback_window_hours}>
          Lookback window (hours)
        </LabelWithTip>
        <input
          id={`${prefix}-lookback`}
          name="lookback_window_hours"
          type="number"
          min={1}
          max={2160}
          defaultValue={defaults?.lookback_window_hours ?? 168}
          className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <LabelWithTip htmlFor={`${prefix}-deal`} tip={CONTENT_SIGNAL_FIELD_TIPS.deal_unit_tokens}>
          Deal unit tokens
        </LabelWithTip>
        <textarea
          id={`${prefix}-deal`}
          name="deal_unit_tokens"
          rows={2}
          defaultValue={defaults?.deal_unit_tokens?.join("\n") ?? ""}
          className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">Min deal strength for auto posts (%)</span>
        <input
          name="post_min_deal_pct"
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={defaults?.post_min_deal_pct ?? 50}
          className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">Feed sync schedule (default for new signals)</span>
        <select
          name="ingest_interval_minutes"
          defaultValue={
            defaults?.ingest_interval_minutes == null
              ? ""
              : String(defaults.ingest_interval_minutes)
          }
          className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
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
          className="h-4 w-4"
        />
        <span>Active by default</span>
      </label>
    </>
  );
}

export default async function ContentSignalsPage({
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
  const countById = Object.fromEntries(sourceCounts.map((x) => [x.id, x.count]));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Content Signals"
        description="Define keywords, lookback, and deal parsing. Save reusable templates or create signals from scratch. Attach Gmail sources on each signal's detail page."
      />

      {statusBanner(sp)}

      <section className="ui-card p-6">
        <h2 className="mb-1 text-lg font-medium">Templates</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">{CONTENT_SIGNAL_FIELD_TIPS.templates}</p>

        {templates.length === 0 ? (
          <p className="mb-4 text-sm text-[var(--muted)]">
            No templates yet. Save one from an existing signal below.
          </p>
        ) : (
          <ul className="mb-6 space-y-4">
            {templates.map((t) => (
              <li key={t.id} className="rounded-lg border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-sm text-[var(--muted)]">{t.description || "—"}</p>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Keywords: {t.keywords.join(", ") || "—"} · Lookback: {t.lookback_window_hours}h ·
                      Posts min: {t.post_min_deal_pct}%
                    </p>
                  </div>
                  <form action={createSignalFromTemplateAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="template_id" value={t.id} />
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-[var(--muted)]">New signal name</span>
                      <input
                        name="signal_name"
                        required
                        placeholder={t.name}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
                      />
                    </label>
                    <button
                      type="submit"
                      className="ui-btn-primary px-3 py-2 text-sm font-medium text-white"
                    >
                      Create signal
                    </button>
                  </form>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-[var(--accent)]">Edit template</summary>
                  <form action={saveTemplateAction} className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3">
                    <input type="hidden" name="id" value={t.id} />
                    {templateFieldsForm(`tpl-${t.id}`, t)}
                    <button type="submit" className="w-fit rounded bg-[var(--accent)] px-3 py-1 text-sm text-white">
                      Update template
                    </button>
                  </form>
                </details>
                <form action={deleteTemplateAction} className="mt-2">
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="text-sm text-red-400 hover:underline">
                    Delete template
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <details>
          <summary className="cursor-pointer text-sm font-medium text-[var(--accent)]">
            Add template manually
          </summary>
          <form action={saveTemplateAction} className="mt-4 grid gap-4">
            {templateFieldsForm("new-template")}
            <button
              type="submit"
              className="w-fit rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
            >
              Save template
            </button>
          </form>
        </details>
      </section>

      <section className="ui-card p-6">
        <h2 className="mb-4 text-lg font-medium">Add content signal</h2>
        <form action={saveContentSignalAction} className="grid gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="cs-add-name" tip={CONTENT_SIGNAL_FIELD_TIPS.name}>
              Name
            </LabelWithTip>
            <input
              id="cs-add-name"
              name="name"
              required
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
              placeholder="Gambling"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="cs-add-description" tip={CONTENT_SIGNAL_FIELD_TIPS.description}>
              Description
            </LabelWithTip>
            <textarea
              id="cs-add-description"
              name="description"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="cs-add-keywords" tip={CONTENT_SIGNAL_FIELD_TIPS.keywords}>
              Keywords
            </LabelWithTip>
            <textarea
              id="cs-add-keywords"
              name="keywords"
              rows={3}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
              placeholder="bonus, free spins, promo"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="cs-add-lookback" tip={CONTENT_SIGNAL_FIELD_TIPS.lookback_window_hours}>
              Lookback window (hours)
            </LabelWithTip>
            <input
              id="cs-add-lookback"
              name="lookback_window_hours"
              type="number"
              min={1}
              max={2160}
              defaultValue={168}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <LabelWithTip htmlFor="cs-add-deal" tip={CONTENT_SIGNAL_FIELD_TIPS.deal_unit_tokens}>
              Deal unit tokens
            </LabelWithTip>
            <textarea
              id="cs-add-deal"
              name="deal_unit_tokens"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
              placeholder="SC, FP, $"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked className="h-4 w-4" />
            <span>Active</span>
          </label>
          <button
            type="submit"
            className="w-fit rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Save content signal
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Existing</h2>
        <ul className="space-y-4">
          {signals.map((cs) => (
            <li key={cs.id} className="ui-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/content-signals/${cs.id}`}
                    className="font-medium text-[var(--fg)] hover:text-[var(--accent)] hover:underline"
                  >
                    {cs.name}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">{cs.description || "—"}</p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Keywords: {cs.keywords.join(", ") || "—"} · Lookback: {cs.lookback_window_hours}h
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {cs.active ? "Active" : "Inactive"} · {countById[cs.id] ?? 0} source(s)
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/content-signals/${cs.id}`}
                    className="rounded border border-[var(--border)] px-3 py-1 text-center text-sm hover:border-[var(--accent)]"
                  >
                    Manage sources
                  </Link>
                  <form action={toggleContentSignalAction}>
                    <input type="hidden" name="id" value={cs.id} />
                    <button
                      type="submit"
                      className="w-full rounded border border-[var(--border)] px-3 py-1 text-sm"
                    >
                      {cs.active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                  <form action={deleteContentSignalAction}>
                    <input type="hidden" name="id" value={cs.id} />
                    <button type="submit" className="text-sm text-red-400 hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
              <form
                action={saveTemplateFromSignalAction}
                className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3"
              >
                <input type="hidden" name="content_signal_id" value={cs.id} />
                <input type="hidden" name="return_to" value="/content-signals" />
                <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
                  <span className="text-[var(--muted)]">Save as template</span>
                  <input
                    name="template_name"
                    placeholder={`${cs.name} template`}
                    className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
                >
                  Save template
                </button>
              </form>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-[var(--accent)]">Edit settings</summary>
                <form
                  action={saveContentSignalAction}
                  className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3"
                >
                  <input type="hidden" name="id" value={cs.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    Name
                    <input
                      name="name"
                      defaultValue={cs.name}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Description
                    <textarea
                      name="description"
                      defaultValue={cs.description}
                      rows={2}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Keywords
                    <textarea
                      name="keywords"
                      defaultValue={cs.keywords.join("\n")}
                      rows={3}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Lookback (hours)
                    <input
                      name="lookback_window_hours"
                      type="number"
                      min={1}
                      defaultValue={cs.lookback_window_hours}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Deal unit tokens
                    <textarea
                      name="deal_unit_tokens"
                      defaultValue={cs.deal_unit_tokens.join("\n")}
                      rows={2}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={cs.active} />
                    Active
                  </label>
                  <button
                    type="submit"
                    className="w-fit rounded bg-[var(--accent)] px-3 py-1 text-sm text-white"
                  >
                    Update
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
