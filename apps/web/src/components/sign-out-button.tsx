"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/login" })}
      className={
        className ?? "text-sm text-[var(--muted)] hover:text-[var(--accent)]"
      }
    >
      Sign out
    </button>
  );
}
