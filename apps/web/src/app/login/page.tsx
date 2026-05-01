import Image from "next/image";
import { redirect } from "next/navigation";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  if (!process.env.INTERNAL_UI_SECRET) {
    redirect("/feed");
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-md">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image
          src="/logo.png"
          alt="ContentIntelligence"
          width={260}
          height={94}
          className="h-14 w-auto"
          priority
        />
        <p className="mt-3 text-sm font-medium text-[var(--muted)]">Content Resourcer · Sign in</p>
      </div>
      <h1 className="sr-only">Sign in</h1>
      {sp.error ? (
        <p className="mb-4 text-sm text-red-400">Invalid credentials.</p>
      ) : null}
      <form action={loginAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={sp.next ?? "/feed"} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Internal password</span>
          <input
            type="password"
            name="password"
            required
            className="rounded border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--fg)]"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-gradient-to-r from-[var(--accent)] to-[var(--accent-bright)] px-4 py-2 font-medium text-white shadow-sm hover:opacity-95"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
