import { ensureIndexes, listInputSignals, listVerticals } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { deleteSignalAction, saveSignalAction } from "./actions";

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
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Vertical</span>
            <select
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
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Signal name</span>
            <input name="name" required className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Gmail account email (must match OAuth)</span>
            <input
              name="email_address"
              type="email"
              required
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Labels (optional, one per line)</span>
            <textarea name="labels" rows={2} className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Sender addresses (optional)</span>
            <textarea
              name="sender_addresses"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Sender domains (optional, e.g. casino.com)</span>
            <textarea
              name="sender_domains"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Subject keywords (optional)</span>
            <textarea
              name="subject_keywords"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Signal keywords (comma or newline)</span>
            <textarea name="keywords" rows={2} className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Lookback window (hours)</span>
            <input
              name="lookback_window_hours"
              type="number"
              min={1}
              max={2160}
              defaultValue={168}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="scan_body" defaultChecked className="h-4 w-4" />
            Scan body
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4" />
            Enabled
          </label>
          <button type="submit" className="w-fit rounded bg-[var(--accent)] px-4 py-2 font-medium text-white">
            Save signal
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Configured signals</h2>
        <ul className="space-y-4">
          {signals.map((s) => (
            <li key={s.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-[var(--muted)]">{s.enabled ? "Enabled" : "Disabled"} · {s.id}</p>
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
                  <label className="flex flex-col gap-1">
                    Vertical
                    <select
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
                  </label>
                  <label className="flex flex-col gap-1">
                    Name
                    <input name="name" defaultValue={s.name} className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2" />
                  </label>
                  <label className="flex flex-col gap-1">
                    Gmail email
                    <input
                      name="email_address"
                      type="email"
                      defaultValue={s.config.email_address}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Labels
                    <textarea
                      name="labels"
                      rows={2}
                      defaultValue={(s.config.labels ?? []).join("\n")}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Sender addresses
                    <textarea
                      name="sender_addresses"
                      rows={2}
                      defaultValue={(s.config.sender_addresses ?? []).join("\n")}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Sender domains
                    <textarea
                      name="sender_domains"
                      rows={2}
                      defaultValue={(s.config.sender_domains ?? []).join("\n")}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Subject keywords
                    <textarea
                      name="subject_keywords"
                      rows={2}
                      defaultValue={(s.config.subject_keywords ?? []).join("\n")}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Keywords
                    <textarea
                      name="keywords"
                      rows={2}
                      defaultValue={s.keywords.join("\n")}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Lookback (hours)
                    <input
                      name="lookback_window_hours"
                      type="number"
                      min={1}
                      defaultValue={s.config.lookback_window_hours}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="scan_body" defaultChecked={s.config.scan_body} className="h-4 w-4" />
                    Scan body
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="h-4 w-4" />
                    Enabled
                  </label>
                  <button type="submit" className="w-fit rounded bg-[var(--accent)] px-3 py-1 text-white">
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
