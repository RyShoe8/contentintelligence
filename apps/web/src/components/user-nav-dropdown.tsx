"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";

type Props = {
  email: string;
  isAdmin: boolean;
  isOrgOwner?: boolean;
};

export function UserNavDropdown({ email, isAdmin, isOrgOwner }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDocMouseDown);
      return () => document.removeEventListener("mousedown", onDocMouseDown);
    }
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[min(100vw-2rem,18rem)] items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--input-bg)] px-3 py-1.5 text-left text-sm text-[var(--fg)] hover:bg-[var(--card)]"
      >
        <span className="min-w-0 flex-1 truncate" title={email}>
          {email}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden
          className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path fill="currentColor" d="M6 8L1 3h10z" />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-1 min-w-[12rem] rounded-md border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
          role="menu"
        >
          {isOrgOwner ? (
            <Link
              href="/org/members"
              role="menuitem"
              className="block px-3 py-2 text-sm text-[var(--fg)] hover:bg-[var(--input-bg)]"
              onClick={() => setOpen(false)}
            >
              Team
            </Link>
          ) : null}
          {isAdmin ? (
            <>
              <Link
                href="/admin/orgs"
                role="menuitem"
                className="block px-3 py-2 text-sm text-[var(--fg)] hover:bg-[var(--input-bg)]"
                onClick={() => setOpen(false)}
              >
                Organizations
              </Link>
              <Link
                href="/admin/users"
                role="menuitem"
                className="block px-3 py-2 text-sm text-[var(--fg)] hover:bg-[var(--input-bg)]"
                onClick={() => setOpen(false)}
              >
                Users
              </Link>
            </>
          ) : null}
          <div
            className={`px-3 py-2 ${isAdmin || isOrgOwner ? "border-t border-[var(--border)]" : ""}`}
          >
            <SignOutButton className="w-full text-left text-sm text-[var(--muted)] hover:text-[var(--accent)]" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
