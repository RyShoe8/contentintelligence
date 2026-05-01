import { ensureIndexes, listInputSignals, listVerticals } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { deleteSignalAction, saveSignalAction } from "./actions";
import { SIGNAL_FIELD_TIPS } from "./field-help";
import { LabelWithTip } from "./label-with-tip";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const db = await connectMongo();
  await ensureIndexes(db);
  const verticals = await listVerticals(db);
  const signals = await listInputSignals(db);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Gmail input signals</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Each signal is a Gmail ingestion rule. OAuth is completed on the Render worker URL.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 text-lg font-medium">Add signal</h2>
        <form action={saveSignalAction} className="grid gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-vertical_id" tip={SIGNAL_FIELD_TIPS.vertical_id}>
              Vertical
            </LabelWithTip>
            <select
              id="signal-add-vertical_id"
              name="vertical_id"
              required
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            >
              <option value="">Select…</option>
              {verticals.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-name" tip={SIGNAL_FIELD_TIPS.name}>
              Signal name
            </LabelWithTip>
            <input
              id="signal-add-name"
              name="name"
              required
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-email_address" tip={SIGNAL_FIELD_TIPS.email_address}>
              Gmail account email (must match OAuth)
            </LabelWithTip>
            <input
              id="signal-add-email_address"
              name="email_address"
              type="email"
              required
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-labels" tip={SIGNAL_FIELD_TIPS.labels}>
              Labels (optional, one per line)
            </LabelWithTip>
            <textarea
              id="signal-add-labels"
              name="labels"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-sender_addresses" tip={SIGNAL_FIELD_TIPS.sender_addresses}>
              Sender addresses (optional)
            </LabelWithTip>
            <textarea
              id="signal-add-sender_addresses"
              name="sender_addresses"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-sender_domains" tip={SIGNAL_FIELD_TIPS.sender_domains}>
              Sender domains (optional, e.g. casino.com)
            </LabelWithTip>
            <textarea
              id="signal-add-sender_domains"
              name="sender_domains"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-subject_keywords" tip={SIGNAL_FIELD_TIPS.subject_keywords}>
              Subject keywords (optional)
            </LabelWithTip>
            <textarea
              id="signal-add-subject_keywords"
              name="subject_keywords"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-keywords" tip={SIGNAL_FIELD_TIPS.keywords}>
              Signal keywords (comma or newline)
            </LabelWithTip>
            <textarea
              id="signal-add-keywords"
              name="keywords"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <LabelWithTip htmlFor="signal-add-lookback_window_hours" tip={SIGNAL_FIELD_TIPS.lookback_window_hours}>
              Lookback window (hours)
            </LabelWithTip>
            <input
              id="signal-add-lookback_window_hours"
              name="lookback_window_hours"
              type="number"
              min={1}
              max={2160}
              defaultValue={168}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="signal-add-scan_body"
              type="checkbox"
              name="scan_body"
              defaultChecked
              className="h-4 w-4 shrink-0"
            />
            <LabelWithTip htmlFor="signal-add-scan_body" tip={SIGNAL_FIELD_TIPS.scan_body}>
              Scan body
            </LabelWithTip>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="signal-add-enabled"
              type="checkbox"
              name="enabled"
              defaultChecked
              className="h-4 w-4 shrink-0"
            />
            <LabelWithTip htmlFor="signal-add-enabled" tip={SIGNAL_FIELD_TIPS.enabled}>
              Enabled
            </LabelWithTip>
          </div>
          <button type="submit" className="w-fit rounded bg-[var(--accent)] px-4 py-2 font-medium text-white">
            Save signal
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Configured signals</h2>
        <ul className="space-y-4">
          {signals.map((s) => {
            const p = `signal-edit-${s.id}`;
            return (
              <li key={s.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {s.enabled ? "Enabled" : "Disabled"} · {s.id}
                    </p>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Account: {s.config.email_address} · lookback {s.config.lookback_window_hours}h
                    </p>
                  </div>
                  <form action={deleteSignalAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="text-sm text-red-400 hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-[var(--accent)]">Edit</summary>
                  <form action={saveSignalAction} className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 text-sm">
                    <input type="hidden" name="id" value={s.id} />
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-vertical_id`} tip={SIGNAL_FIELD_TIPS.vertical_id}>
                        Vertical
                      </LabelWithTip>
                      <select
                        id={`${p}-vertical_id`}
                        name="vertical_id"
                        required
                        defaultValue={s.vertical_id}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      >
                        {verticals.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-name`} tip={SIGNAL_FIELD_TIPS.name}>
                        Name
                      </LabelWithTip>
                      <input
                        id={`${p}-name`}
                        name="name"
                        defaultValue={s.name}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-email_address`} tip={SIGNAL_FIELD_TIPS.email_address}>
                        Gmail email
                      </LabelWithTip>
                      <input
                        id={`${p}-email_address`}
                        name="email_address"
                        type="email"
                        defaultValue={s.config.email_address}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-labels`} tip={SIGNAL_FIELD_TIPS.labels}>
                        Labels
                      </LabelWithTip>
                      <textarea
                        id={`${p}-labels`}
                        name="labels"
                        rows={2}
                        defaultValue={(s.config.labels ?? []).join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-sender_addresses`} tip={SIGNAL_FIELD_TIPS.sender_addresses}>
                        Sender addresses
                      </LabelWithTip>
                      <textarea
                        id={`${p}-sender_addresses`}
                        name="sender_addresses"
                        rows={2}
                        defaultValue={(s.config.sender_addresses ?? []).join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-sender_domains`} tip={SIGNAL_FIELD_TIPS.sender_domains}>
                        Sender domains
                      </LabelWithTip>
                      <textarea
                        id={`${p}-sender_domains`}
                        name="sender_domains"
                        rows={2}
                        defaultValue={(s.config.sender_domains ?? []).join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-subject_keywords`} tip={SIGNAL_FIELD_TIPS.subject_keywords}>
                        Subject keywords
                      </LabelWithTip>
                      <textarea
                        id={`${p}-subject_keywords`}
                        name="subject_keywords"
                        rows={2}
                        defaultValue={(s.config.subject_keywords ?? []).join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-keywords`} tip={SIGNAL_FIELD_TIPS.keywords}>
                        Keywords
                      </LabelWithTip>
                      <textarea
                        id={`${p}-keywords`}
                        name="keywords"
                        rows={2}
                        defaultValue={s.keywords.join("\n")}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <LabelWithTip htmlFor={`${p}-lookback_window_hours`} tip={SIGNAL_FIELD_TIPS.lookback_window_hours}>
                        Lookback (hours)
                      </LabelWithTip>
                      <input
                        id={`${p}-lookback_window_hours`}
                        name="lookback_window_hours"
                        type="number"
                        min={1}
                        max={2160}
                        defaultValue={s.config.lookback_window_hours}
                        className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${p}-scan_body`}
                        type="checkbox"
                        name="scan_body"
                        defaultChecked={s.config.scan_body}
                        className="h-4 w-4 shrink-0"
                      />
                      <LabelWithTip htmlFor={`${p}-scan_body`} tip={SIGNAL_FIELD_TIPS.scan_body}>
                        Scan body
                      </LabelWithTip>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${p}-enabled`}
                        type="checkbox"
                        name="enabled"
                        defaultChecked={s.enabled}
                        className="h-4 w-4 shrink-0"
                      />
                      <LabelWithTip htmlFor={`${p}-enabled`} tip={SIGNAL_FIELD_TIPS.enabled}>
                        Enabled
                      </LabelWithTip>
                    </div>
                    <button type="submit" className="w-fit rounded bg-[var(--accent)] px-3 py-1 text-white">
                      Update
                    </button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
