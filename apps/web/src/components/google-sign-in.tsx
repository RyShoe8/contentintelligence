"use client";

import { signIn } from "next-auth/react";

export function GoogleSignIn({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button
      type="button"
      onClick={() => void signIn("google", { callbackUrl })}
      className="rounded-md bg-gradient-to-r from-[var(--accent)] to-[var(--accent-bright)] px-4 py-3 font-medium text-white shadow-sm hover:opacity-95"
    >
      Continue with Google
    </button>
  );
}
