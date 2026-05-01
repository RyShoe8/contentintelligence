import { ensureIndexes, listVerticals } from "@content-resourcer/db";
import { connectMongo } from "@/lib/mongo";
import { deleteVerticalAction, saveVerticalAction, toggleVerticalAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function VerticalsPage() {
  const db = await connectMongo();
  await ensureIndexes(db);
  const verticals = await listVerticals(db);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Verticals</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configure verticals and default keywords used in pre-filtering.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 text-lg font-medium">Add vertical</h2>
        <form action={saveVerticalAction} className="grid gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Name</span>
            <input
              name="name"
              required
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
              placeholder="Gambling"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Description</span>
            <textarea
              name="description"
              rows={2}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Default keywords (comma or newline)</span>
            <textarea
              name="keywords"
              rows={3}
              className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
              placeholder="bonus, free spins, promo"
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
            Save vertical
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Existing</h2>
        <ul className="space-y-4">
          {verticals.map((v) => (
            <li
              key={v.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{v.name}</p>
                  <p className="text-sm text-[var(--muted)]">{v.description || "—"}</p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Keywords: {v.default_keywords.join(", ") || "—"}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {v.active ? "Active" : "Inactive"} · {v.id}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <form action={toggleVerticalAction}>
                    <input type="hidden" name="id" value={v.id} />
                    <button
                      type="submit"
                      className="rounded border border-[var(--border)] px-3 py-1 text-sm"
                    >
                      {v.active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                  <form action={deleteVerticalAction}>
                    <input type="hidden" name="id" value={v.id} />
                    <button type="submit" className="text-sm text-red-400 hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-[var(--accent)]">Edit</summary>
                <form action={saveVerticalAction} className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3">
                  <input type="hidden" name="id" value={v.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    Name
                    <input
                      name="name"
                      defaultValue={v.name}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Description
                    <textarea
                      name="description"
                      defaultValue={v.description}
                      rows={2}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Keywords
                    <textarea
                      name="keywords"
                      defaultValue={v.default_keywords.join("\n")}
                      rows={3}
                      className="rounded border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] px-3 py-2"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={v.active} />
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
