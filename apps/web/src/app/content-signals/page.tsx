import Link from "next/link";
import { ensureIndexes, listContentSignals, listSourcesByContentSignal } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { requireOrgMember } from "@/lib/org-auth";
import {
  deleteContentSignalAction,
  saveContentSignalAction,
  toggleContentSignalAction,
} from "./actions";
import { LabelWithTip } from "../signals/label-with-tip";
import { CONTENT_SIGNAL_FIELD_TIPS } from "./field-help";

export const dynamic = "force-dynamic";

export default async function ContentSignalsPage() {
  const session = await requireOrgMember();
  const db = await connectMongo();
  await ensureIndexes(db);
  const signals = await listContentSignals(db, { organizationId: session.user.organizationId });
  const sourceCounts = await Promise.all(
    signals.map(async (s) => ({
      id: s.id,
      count: (await listSourcesByContentSignal(db, s.id)).length,
    })),
  );
  const countById = Object.fromEntries(sourceCounts.map((x) => [x.id, x.count]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Content Signals</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Define keywords, lookback, and deal parsing. Attach Gmail sources on each signal&apos;s detail page.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
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
            <li
              key={cs.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
            >
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
