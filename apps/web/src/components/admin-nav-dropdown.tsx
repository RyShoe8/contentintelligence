"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function AdminNavDropdown() {
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
        className="ui-btn-secondary flex h-9 items-center gap-2 px-3"
      >
        Admin
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
          className="ui-card absolute right-0 z-50 mt-1 min-w-[11rem] py-1 shadow-md"
          role="menu"
        >
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
        </div>
      ) : null}
    </div>
  );
}
