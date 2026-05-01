import Image from "next/image";
import { auth } from "@/auth";
import { GoogleSignIn } from "@/components/google-sign-in";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user) {
    redirect(sp.next?.startsWith("/") ? sp.next : "/feed");
  }

  if (!process.env.AUTH_GOOGLE_ID) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-md">
        <p className="text-sm text-[var(--muted)]">
          Sign-in is not configured. Set <code className="text-[var(--fg)]">AUTH_GOOGLE_ID</code>,{" "}
          <code className="text-[var(--fg)]">AUTH_GOOGLE_SECRET</code>,{" "}
          <code className="text-[var(--fg)]">AUTH_SECRET</code>, and{" "}
          <code className="text-[var(--fg)]">AUTH_URL</code> on Vercel.
        </p>
      </div>
    );
  }

  const next = sp.next?.startsWith("/") ? sp.next : "/feed";

  return (
    <div className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-md">
      <div className="mb-4 flex flex-col items-center text-center">
        <Image
          src="/logo.png"
          alt="ContentIntelligence"
          width={300}
          height={108}
          className="h-16 w-auto"
          priority
        />
        <p className="mt-3 text-sm font-medium text-[var(--muted)]">Content Resourcer · Sign in</p>
      </div>
      <h1 className="sr-only">Sign in</h1>
      {sp.error ? (
        <p className="mb-4 text-sm text-red-400">Sign-in failed. Try again.</p>
      ) : null}
      <div className="flex justify-center">
        <GoogleSignIn callbackUrl={next} />
      </div>
    </div>
  );
}
